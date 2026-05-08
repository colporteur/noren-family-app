// Supabase Edge Function: parse-game-spreadsheet
// =========================================================================
// Takes the raw cell contents of an uploaded spreadsheet and asks Claude
// to extract every game session it can find. Designed to be flexible —
// users (Mom!) make wildly varied custom spreadsheets, so we send the data
// to Claude and let it figure out the layout.
//
// Request body:
//   { sheets: Array<{ name: string, cells: any[][] }> }
//   - cells is a 2D array (rows × cols) where each cell is the raw value
//     (string | number | null) parsed by SheetJS on the client.
//
// Response: same shape as transcribe-game-photo:
//   { sessions: SessionSuggestion[], confidence: 'high'|'medium'|'low', source_notes?: string }
// =========================================================================

// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

// Reuse the same tool schema as the photo function for consistency.
const recordTool = {
  name: 'record_game_sessions',
  description:
    'Record one or more board-game sessions extracted from the spreadsheet.',
  input_schema: {
    type: 'object',
    properties: {
      sessions: {
        type: 'array',
        description: 'One entry per recorded play of a game.',
        items: {
          type: 'object',
          properties: {
            game_name: { type: 'string' },
            played_on: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format. Convert any date format you encounter.',
            },
            notes: { type: 'string' },
            players: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  score: { type: 'number' },
                  placement: { type: 'integer' },
                },
                required: ['name'],
                additionalProperties: false,
              },
            },
          },
          required: ['players'],
          additionalProperties: false,
        },
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
      source_notes: { type: 'string' },
    },
    required: ['sessions', 'confidence'],
    additionalProperties: false,
  },
};

// Render a sheet's cell grid as a readable text block for Claude.
// JSON would also work but Claude is great with table-like text and it
// keeps the prompt smaller.
function renderSheet(name: string, cells: any[][]): string {
  if (!cells || cells.length === 0) return `### Sheet: ${name}\n(empty)\n`;
  const lines: string[] = [`### Sheet: ${name}`];
  cells.forEach((row, idx) => {
    if (!row || row.length === 0) {
      lines.push(`Row ${idx + 1}: (blank)`);
      return;
    }
    const stringified = row.map((c) => {
      if (c == null) return '';
      if (typeof c === 'string') return c.replace(/\s+/g, ' ').trim();
      return String(c);
    });
    lines.push(`Row ${idx + 1}: | ${stringified.join(' | ')} |`);
  });
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  let body: { sheets?: Array<{ name?: string; cells?: any[][] }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const sheets = Array.isArray(body.sheets) ? body.sheets : [];
  if (sheets.length === 0) {
    return json({ error: "Need 'sheets' array" }, { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured.' }, { status: 500 });
  }

  // Build a single text payload describing all sheets.
  const sheetText = sheets
    .map((s) => renderSheet(s.name ?? '(unnamed)', Array.isArray(s.cells) ? s.cells : []))
    .join('\n\n');

  // Crude size cap to avoid runaway bills. ~150KB of text is plenty for
  // most family spreadsheets and stays well within token budget.
  const MAX_CHARS = 150_000;
  const truncated = sheetText.length > MAX_CHARS;
  const promptText = truncated ? sheetText.slice(0, MAX_CHARS) + '\n\n[... truncated ...]' : sheetText;

  let upstream: Response;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        tools: [recordTool],
        tool_choice: { type: 'tool', name: 'record_game_sessions' },
        messages: [
          {
            role: 'user',
            content:
              'Below are the contents of a spreadsheet that records board-game (and card-game, dice-game, etc.) ' +
              'play history for a family. Each "session" is one play of one game on a particular date with ' +
              'one or more players who got scores or placements.\n\n' +
              'Layouts vary wildly: each game might have its own sheet/tab; one sheet might list multiple games; ' +
              'rows might be one-per-session or one-per-player; dates might be column headers, row labels, or in cells.\n\n' +
              'Your job: extract every individual play you can confidently identify and call the recording tool.\n' +
              '- A "session" is one play = one row per game-played, with multiple players inside it.\n' +
              '- Use exact player name strings as written in the sheet (we\'ll match them to family members later).\n' +
              '- Convert any date format to YYYY-MM-DD. If only month/year are clear, pick the 1st of the month. ' +
              'If no date is associated with a play, omit played_on.\n' +
              '- Skip header rows, totals rows, and obvious non-data.\n' +
              '- Don\'t fabricate sessions when the data is unclear. If a sheet seems to be a leaderboard summary ' +
              'rather than a session log, prefer to skip it and explain in source_notes.\n' +
              '- Set confidence to "low" if the layout is hard to interpret. Set "high" if you\'re confident every ' +
              'session you returned is correct.\n\n' +
              promptText,
          },
        ],
      }),
    });
  } catch (err) {
    return json({ error: 'Anthropic call failed', detail: String(err) }, { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return json({ error: `Anthropic ${upstream.status}`, detail: text.slice(0, 500) }, { status: 502 });
  }

  const data = (await upstream.json()) as any;
  const toolUse = (data?.content ?? []).find(
    (c: any) => c?.type === 'tool_use' && c?.name === 'record_game_sessions',
  );
  if (!toolUse?.input) {
    return json({ error: 'No tool_use in response' }, { status: 502 });
  }

  const result = toolUse.input;
  if (truncated) {
    result.source_notes =
      (result.source_notes ? result.source_notes + ' ' : '') +
      '(Note: spreadsheet was very large; some content was truncated before sending to AI.)';
  }
  return json(result);
});
