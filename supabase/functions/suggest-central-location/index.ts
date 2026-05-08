// Supabase Edge Function: suggest-central-location
// =========================================================================
// Suggests a fair central US meeting location for a list of family members.
//
// Architecture (now with real geocoding):
//   1. Geocode every input city → precise lat/lon via Google Geocoding API.
//   2. Compute the geographic centroid (simple average of coords) in code.
//   3. Reverse-geocode the centroid → the actual city/town that sits at it.
//   4. Hand all this verified data to Claude (Haiku) which only has to write
//      the human-readable reasoning, fairness note, and alternates.
//
// The math is now deterministic — Claude no longer has to guess where the
// midpoint is. Result quality jumps significantly.
//
// Secrets required:
//   ANTHROPIC_API_KEY        (already configured)
//   GOOGLE_MAPS_API_KEY      (new — see README for setup)
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
  name: 'record_central_location',
  description:
    'Record the suggested central meeting location and alternates given precise geographic data.',
  input_schema: {
    type: 'object',
    properties: {
      recommended: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name as commonly written.' },
          state: { type: 'string', description: '2-letter US state postal code, or country if non-US.' },
          airport: {
            type: 'string',
            description: 'Optional 3-letter IATA airport code only if a major airport is genuinely the draw.',
          },
          reasoning: {
            type: 'string',
            description:
              "2-3 sentence explanation of why this city is the right pick for these specific attendees, referencing the precise geographic data provided.",
          },
          fairness_note: {
            type: 'string',
            description:
              "Per-attendee approximate drive time. Format: 'Lineville: 1.5 hr · Tuscaloosa: 1 hr · Huntsville: 1.5 hr'. Use the lat/lon distances to estimate (rough rule: 60mph = 1 hr per ~60 miles).",
          },
        },
        required: ['city', 'reasoning', 'fairness_note'],
        additionalProperties: false,
      },
      alternates: {
        type: 'array',
        description: 'Up to 3 alternates with brief reasoning. Vary by size: include at least one smaller-town option AND one bigger-airport option when reasonable.',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            state: { type: 'string' },
            airport: { type: 'string' },
            reason: { type: 'string', description: 'One sentence on the trade-off (e.g., "smaller, quieter, but no airport" or "bigger hub but ~30 min farther for everyone").' },
          },
          required: ['city', 'reason'],
          additionalProperties: false,
        },
      },
      method: {
        type: 'string',
        description: "Brief: 'Centroid: 33.74°N, 86.63°W → Trussville, AL is the nearest town.' or similar.",
      },
    },
    required: ['recommended'],
    additionalProperties: false,
  },
};

interface GeocodedCity {
  raw_name: string;
  raw_city: string;
  formatted_address?: string;
  lat?: number;
  lng?: number;
  error?: string;
}

async function geocode(query: string, apiKey: string): Promise<{ lat: number; lng: number; formatted: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) return null;
  const top = data.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted: top.formatted_address,
  };
}

async function reverseGeocode(lat: number, lng: number, apiKey: string): Promise<{ city: string; state: string; formatted: string } | null> {
  // result_type=locality biases toward returning a town/city rather than a street address.
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) {
    // Fallback: try without result_type filter
    const fb = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`);
    if (!fb.ok) return null;
    const fbData = await fb.json();
    if (fbData.status !== 'OK' || !fbData.results?.length) return null;
    return parseGeocodeResult(fbData.results[0]);
  }
  return parseGeocodeResult(data.results[0]);
}

function parseGeocodeResult(r: any): { city: string; state: string; formatted: string } | null {
  let city = '';
  let state = '';
  for (const c of r.address_components ?? []) {
    if (c.types.includes('locality')) city = c.long_name;
    else if (!city && c.types.includes('postal_town')) city = c.long_name;
    else if (!city && c.types.includes('administrative_area_level_3')) city = c.long_name;
    if (c.types.includes('administrative_area_level_1')) state = c.short_name;
  }
  if (!city) return null;
  return { city, state, formatted: r.formatted_address };
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

  let body: { locations?: Array<{ name?: unknown; city?: unknown }>; context?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const inputLocations = Array.isArray(body.locations) ? body.locations : [];
  const cleaned: Array<{ name: string; city: string }> = [];
  for (const l of inputLocations) {
    const name = typeof l.name === 'string' ? l.name.trim() : '';
    const city = typeof l.city === 'string' ? l.city.trim() : '';
    if (city) cleaned.push({ name: name || '(unnamed)', city });
  }
  if (cleaned.length < 2) {
    return json({ error: 'Need at least 2 locations with cities filled in.' }, { status: 400 });
  }
  if (cleaned.length > 50) {
    return json({ error: 'Too many locations (max 50).' }, { status: 400 });
  }

  const context = typeof body.context === 'string' ? body.context.trim().slice(0, 500) : '';

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured.' }, { status: 500 });
  if (!googleKey) return json({ error: 'GOOGLE_MAPS_API_KEY not configured. See README.' }, { status: 500 });

  // 1. Geocode every input city in parallel.
  const geocoded: GeocodedCity[] = await Promise.all(
    cleaned.map(async (c): Promise<GeocodedCity> => {
      const g = await geocode(c.city, googleKey);
      if (!g) return { raw_name: c.name, raw_city: c.city, error: 'Could not geocode' };
      return {
        raw_name: c.name,
        raw_city: c.city,
        formatted_address: g.formatted,
        lat: g.lat,
        lng: g.lng,
      };
    }),
  );

  const found = geocoded.filter((g) => g.lat != null && g.lng != null);
  if (found.length < 2) {
    const failed = geocoded
      .filter((g) => g.error)
      .map((g) => `"${g.raw_city}"`)
      .join(', ');
    return json(
      {
        error:
          `Couldn't geocode enough cities. Try being more specific (include state). Failed: ${failed || 'none'}.`,
      },
      { status: 400 },
    );
  }

  // 2. Compute centroid (simple unweighted average).
  const sumLat = found.reduce((s, g) => s + (g.lat as number), 0);
  const sumLng = found.reduce((s, g) => s + (g.lng as number), 0);
  const centroid = { lat: sumLat / found.length, lng: sumLng / found.length };

  // 3. Reverse-geocode the centroid to find the actual nearest town/city.
  const centroidPlace = await reverseGeocode(centroid.lat, centroid.lng, googleKey);

  // 4. Compute approximate distance from each input city to the centroid.
  //    Include lat/lng so the frontend can plot markers.
  const attendeePoints = found.map((g) => ({
    name: g.raw_name,
    city: g.raw_city,
    lat: g.lat as number,
    lng: g.lng as number,
    miles: Math.round(
      haversineMiles({ lat: g.lat as number, lng: g.lng as number }, centroid),
    ),
  }));
  const distancesMi = attendeePoints; // backwards-compat alias used by prompt below

  // 5. Build the prompt for Claude with all the verified data.
  const peopleList = found
    .map((g, i) => `${i + 1}. ${g.raw_name} — ${g.formatted_address} (${g.lat?.toFixed(4)}, ${g.lng?.toFixed(4)})`)
    .join('\n');
  const distList = distancesMi
    .map((d) => `${d.name} (${d.city}): ${d.miles} mi from centroid`)
    .join('\n');

  const promptText =
    `I've already done the geographic math for you. Below are precise coordinates and the computed centroid.\n\n` +
    `Attendees:\n${peopleList}\n\n` +
    `Geographic centroid (simple average of all attendee coordinates): ` +
    `${centroid.lat.toFixed(4)}°N, ${centroid.lng.toFixed(4)}°W\n` +
    (centroidPlace
      ? `City at the centroid (per Google reverse-geocoding): ${centroidPlace.city}, ${centroidPlace.state} (${centroidPlace.formatted})\n`
      : '(Reverse-geocoding the centroid did not return a clean city name.)\n') +
    `\nApproximate straight-line distance from each attendee to the centroid:\n${distList}\n\n` +
    (context ? `Additional context from the user: ${context}\n\n` : '') +
    `Your job:\n` +
    `1. Recommend the right meeting place. Default to the city at the centroid IF it's a reasonable size and ` +
    `not a tiny unincorporated area. Otherwise pick the nearest reasonable city/town to the centroid that ` +
    `you know is real and has somewhere people could meet (a hotel, restaurant, etc.).\n` +
    `2. Don't override the math with airport-hub bias. The centroid is the centroid. Major hubs are only ` +
    `the right answer if the centroid happens to be near one OR if the attendees are clearly flying long distances.\n` +
    `3. Provide a per-attendee drive-time estimate in fairness_note. Use the straight-line miles above and ` +
    `assume highway speeds (~60 mph). Round to nearest 0.5 hour.\n` +
    `4. For alternates, include some variety: e.g., a smaller/quieter town option AND a bigger-airport ` +
    `option, with brief trade-off notes.\n\n` +
    `Call the recording tool.`;

  let upstream: Response;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        tools: [recordTool],
        tool_choice: { type: 'tool', name: 'record_central_location' },
        messages: [{ role: 'user', content: promptText }],
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
    (c: any) => c?.type === 'tool_use' && c?.name === 'record_central_location',
  );
  if (!toolUse?.input) {
    return json({ error: 'No tool_use in response' }, { status: 502 });
  }

  // 6. Geocode the city Claude actually recommended so the frontend can plot
  //    a destination marker at its real coordinates (the recommended city is
  //    usually close to the centroid but not identical).
  const recName: string = toolUse.input?.recommended?.city ?? '';
  const recState: string = toolUse.input?.recommended?.state ?? '';
  const recQuery = recName ? `${recName}${recState ? ', ' + recState : ''}` : '';
  let recommendedCoords: { lat: number; lng: number; formatted: string } | null = null;
  if (recQuery) {
    recommendedCoords = await geocode(recQuery, googleKey);
  }

  // Add the geocoded debug info so the frontend can show it if helpful.
  const result = {
    ...toolUse.input,
    debug: {
      centroid,
      centroid_city: centroidPlace,
      attendees: attendeePoints,
      recommended_coords: recommendedCoords,
    },
  };
  return json(result);
});
