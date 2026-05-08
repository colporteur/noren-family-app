// Supabase Edge Function: enrich-board-game
// =========================================================================
// Takes a board-game NAME from the client and returns structured details
// (player counts, time, complexity, tags, one-liner) by asking Claude.
//
// The Anthropic API key NEVER leaves the server. Set it once with:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// or, in the Supabase dashboard:
//   Project Settings → Edge Functions → Manage Secrets → add ANTHROPIC_API_KEY
//
// Frontend usage:
//   const { data, error } = await supabase.functions.invoke('enrich-board-game', {
//     body: { name: 'Catan' },
//   });
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

// Tool definition — Claude will fill this schema in via tool use, which gives
// us guaranteed-shape JSON instead of having to parse free-form text.
const recordTool = {
  name: 'record_board_game_info',
  description:
    'Record the looked-up details about a tabletop game (board game, card game, dice game, party game, etc.).',
  input_schema: {
    type: 'object',
    properties: {
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description:
          'How sure you are that you correctly identified a real game (published board game OR a well-known traditional game played with cards, dice, tiles, etc.). Classic card games like Poker, Hearts, Spades, Bridge, Gin Rummy, Nertz, and dice games like Yahtzee count as real games — return "high" confidence for these. Use "low" only if you genuinely cannot identify the game from the name given.',
      },
      min_players: {
        type: 'integer',
        description: 'Minimum number of players supported (omit if unknown).',
      },
      max_players: {
        type: 'integer',
        description: 'Maximum number of players supported (omit if unknown).',
      },
      typical_minutes: {
        type: 'integer',
        description:
          'Typical playing time in minutes for an average game (omit if unknown).',
      },
      weight: {
        type: 'number',
        description:
          'Complexity on the BoardGameGeek scale, 1.0 (very light/family) to 5.0 (very heavy/strategy). Round to ONE decimal place (e.g. 1.8, 2.5, 3.0) — never two decimals. Omit if unknown.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Up to 5 short, lowercase descriptors. Pick from genres ("strategy","family","party","cooperative","abstract","wargame","euro","ameritrash","trivia","word","card-game","traditional"), mechanics ("dice","cards","auction","drafting","worker-placement","deck-building","area-control","tile-placement","roll-and-write","social-deduction","trick-taking","betting","shedding"), or duration ("quick","filler","epic"). Avoid duplicates.',
      },
      notes: {
        type: 'string',
        description:
          'A single sentence (≤140 characters) describing what playing the game feels like.',
      },
      canonical_name: {
        type: 'string',
        description:
          "The widely-used name of the game (e.g. 'Catan' rather than 'Settlers of Catan' for the modern edition). Helps when the user typed a near-miss.",
      },
    },
    required: ['confidence'],
    additionalProperties: false,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON like { name: 'Catan' }" }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return json({ error: "Missing or empty 'name'" }, { status: 400 });
  }
  if (name.length > 120) {
    return json({ error: "'name' is too long" }, { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json(
      {
        error:
          'ANTHROPIC_API_KEY is not configured on the server. See README.md for setup steps.',
      },
      { status: 500 },
    );
  }

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
        max_tokens: 512,
        tools: [recordTool],
        tool_choice: { type: 'tool', name: 'record_board_game_info' },
        messages: [
          {
            role: 'user',
            content:
              `Look up the tabletop game named "${name}" and call the recording tool with what you know. ` +
              `This includes published board games (Catan, Wingspan, Ticket to Ride), classic card games ` +
              `(Poker, Hearts, Spades, Bridge, Nertz, Gin Rummy, Cribbage), dice games (Yahtzee, Farkle), ` +
              `party games, and similar traditional/family games — all of these count as real games and ` +
              `should get "high" confidence if you recognize them. ` +
              `Use the BoardGameGeek 1.0–5.0 weight scale rounded to ONE decimal place. ` +
              `Only set confidence to "low" if the name is genuinely unrecognizable; in that case omit ` +
              `the optional fields. Be concise in the notes field.`,
          },
        ],
      }),
    });
  } catch (err) {
    return json(
      { error: 'Failed to reach Anthropic API', detail: String(err) },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return json(
      { error: `Anthropic API ${upstream.status}`, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as any;
  const toolUse = (data?.content ?? []).find(
    (c: any) => c?.type === 'tool_use' && c?.name === 'record_board_game_info',
  );

  if (!toolUse?.input) {
    return json(
      { error: 'Claude did not return tool_use', raw: data },
      { status: 502 },
    );
  }

  // toolUse.input is the structured object Claude filled in.
  return json(toolUse.input);
});
