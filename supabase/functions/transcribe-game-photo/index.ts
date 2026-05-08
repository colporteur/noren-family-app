// Supabase Edge Function: transcribe-game-photo
// =========================================================================
// Takes a photo of a game scoresheet and returns one structured session
// suggestion. Uses Claude's vision capability.
//
// Request body: { imageBase64: string, mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }
// Response: { suggestions: SessionSuggestion[] }   (usually length 1)
//
// Reuses the ANTHROPIC_API_KEY secret. Set once in:
//   Supabase → Project Settings → Edge Functions → Manage Secrets
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

const recordTool = {
  name: 'record_game_sessions',
  description:
    'Record one or more board-game sessions extracted from the photo. Each session is one play of one game.',
  input_schema: {
    type: 'object',
    properties: {
      sessions: {
        type: 'array',
        description: 'One entry per recorded play. Most photos will have just one.',
        items: {
          type: 'object',
          properties: {
            game_name: {
              type: 'string',
              description:
                'The name of the game played, as written on the photo. Use the canonical name if obvious.',
            },
            played_on: {
              type: 'string',
              description:
                "Date played in YYYY-MM-DD format. If only month/year are shown, pick the 1st of the month. If no date is visible, omit.",
            },
            notes: {
              type: 'string',
              description:
                'Any handwritten notes, comments, or observations from the photo. Keep concise.',
            },
            players: {
              type: 'array',
              description: 'One entry per player who participated.',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description:
                      "The player's name as written on the photo. Use first name only if that's all that's visible.",
                  },
                  score: {
                    type: 'number',
                    description: 'Numeric score, if shown. Omit if not numeric.',
                  },
                  placement: {
                    type: 'integer',
                    description: '1 for the winner, 2 for second, etc. Omit if not determinable.',
                  },
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
        description:
          'Overall confidence that the extracted data is correct.',
      },
      source_notes: {
        type: 'string',
        description:
          'Brief commentary about anything ambiguous, illegible, or worth flagging to the human reviewer.',
      },
    },
    required: ['sessions', 'confidence'],
    additionalProperties: false,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  let body: { imageBase64?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : '';
  if (!imageBase64 || !mediaType) {
    return json({ error: "Need 'imageBase64' and 'mediaType'" }, { status: 400 });
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) {
    return json({ error: `Unsupported mediaType: ${mediaType}` }, { status: 400 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured.' }, { status: 500 });
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
        max_tokens: 2048,
        tools: [recordTool],
        tool_choice: { type: 'tool', name: 'record_game_sessions' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text:
                  'This is a photo of a hand-written or printed board-game scoresheet. ' +
                  'Extract every play recorded on the sheet and call the recording tool. ' +
                  'For each play: identify the game, the players who participated, their scores ' +
                  '(numeric only — skip non-numeric annotations), and placement (1 = winner). ' +
                  'If the same sheet shows multiple plays of the same game, return one session per play. ' +
                  'If anything is illegible or ambiguous, omit that field rather than guessing wildly, ' +
                  'and mention it in source_notes. Use confidence "low" if you can\'t reliably read the photo.',
              },
            ],
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

  return json(toolUse.input);
});
