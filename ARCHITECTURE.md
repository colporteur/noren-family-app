# Architecture & Roadmap

This is the overall sketch of The Noren Family App. Future sessions can read this doc to pick up exactly where we left off.

## Stack

| Layer       | Choice                                                | Why |
|-------------|-------------------------------------------------------|-----|
| Frontend    | React 18 + Vite + TypeScript                          | Mature, fast dev loop, strong types help as the app grows. |
| Styling     | Tailwind CSS                                          | Quick to iterate on; warm/family palette in `tailwind.config.js`. |
| Routing     | react-router-dom v6                                   | Standard. |
| PWA         | `vite-plugin-pwa` (Workbox)                           | One plugin handles manifest + service worker + auto-update. |
| Auth        | Supabase Auth (magic-link email)                      | No passwords; family-friendly. |
| DB          | Supabase Postgres                                     | RLS keeps data secure with minimal backend code. |
| Server fns  | Supabase Edge Functions (Deno)                        | For Claude API calls — keeps the API key off the client. |
| Hosting     | Vercel (or Supabase Hosting / Netlify / Cloudflare)   | Auto-deploy on `git push`. |

## Roles

```
type FamilyRole = 'dictator' | 'family' | 'guest'
```

The trigger `handle_new_user()` makes the *first* user who ever signs in a `dictator`. Everyone else starts as `family`. Dictators can promote/demote anyone via Dictator Mode → Manage Family.

The "deceased" status is a separate boolean flag (`is_deceased` + `deceased_on`) so we never lose data — their predictions, scores, and plaques stay intact, but they're hidden from active views and shown with a memorial badge.

Guests have an optional `guest_expires_at` timestamp. (Frontend respects this today only as a display; later we'll add a server-side check or scheduled function to disable expired guests.)

## Routes

| Path                          | Who can see it       |
|-------------------------------|----------------------|
| `/login`                      | Public               |
| `/`                           | Any signed-in user   |
| `/family`                     | Any signed-in user   |
| `/me`                         | Any signed-in user   |
| `/dictator`                   | Dictators only       |
| `/dictator/members`           | Dictators only       |
| `/dictator/invite`            | Dictators only       |
| `/apps/nye`                   | Any signed-in user   |
| `/apps/games/picker`          | Any signed-in user   |
| `/apps/games/records`         | Any signed-in user   |
| `/apps/central-location`      | Any signed-in user   |
| `/apps/ncaa`                  | Any signed-in user   |
| `/apps/plaques`               | Any signed-in user   |
| `/apps/voting`                | Any signed-in user   |
| `/apps/meetings`              | Any signed-in user   |
| `/apps/late`                  | Any signed-in user   |

## Database

### `profiles`
One row per family member, linked 1:1 to `auth.users.id`.

| Column            | Type        | Notes |
|-------------------|-------------|-------|
| id                | uuid PK     | references `auth.users(id)` |
| email             | text unique | |
| first_name, last_name, nickname | text | |
| role              | family_role | enum: dictator/family/guest |
| is_deceased       | boolean     | |
| deceased_on       | date        | |
| guest_expires_at  | timestamptz | |
| phone, birthday, location, avatar_url, bio | text/date | directory data |
| created_at, updated_at | timestamptz | |

RLS:
- All authenticated users can SELECT all profiles (it's a directory).
- Each user can UPDATE their own profile but not change their role or deceased status.
- Dictators can do anything to any profile.

### Mini-app tables (created up front, will be used in future sessions)

- `nye_questions` / `nye_predictions`
- `board_games` / `game_sessions` / `game_session_scores`
- `ncaa_pool_standings`
- `plaques`
- `votes_polls` / `votes_options` / `votes_ballots`
- `meeting_proposals` / `meeting_responses`
- `late_pings`

All have RLS enabled with permissive read/write for authenticated users (we'll tighten per-app as we build them).

## Mini-app build plan

The order isn't fixed; pick whatever's most fun next session. Rough estimates:

| # | Mini-app | Difficulty | Notes |
|---|----------|------------|-------|
| 1 | New Year's Predictions | Medium | Yearly cycle, score calculation, reveal flow. |
| 2 | Board Game Picker | Easy | Mostly UI with a few pick algorithms. |
| 3 | Game Record Book | Medium | Forms for sessions, stats queries, charts. |
| 4 | Central Location | Medium | First Edge Function — sets the pattern for Claude API calls. |
| 5 | NCAA Pool | Easy | Simple paste-in standings table; chart bonus. |
| 6 | Virtual Plaques | Medium | Visual UI; pulls from #1 and #5 winners/losers. |
| 7 | Voting Portal | Medium | Single/multi/ranked voting math; admin UI. |
| 8 | Meeting Scheduler | Medium | Three modes (ranked / available / vote); tricky UI. |
| 9 | Running Late/Early | Easy | Feed + push notification (browser API). |

### Built so far

- ✅ **Board Game Picker** (`src/pages/miniapps/BoardGameSelector.tsx`) — Library + Picker tabs, three pick modes (random / filtered / weighted-by-recency), "✨ Look it up" button calls the `enrich-board-game` Edge Function for AI auto-fill, **Veto Mode** (toggleable by Dictators) with both a Dictator-managed master list and per-user veto picks (limit configurable), "Select Game" flow records who played into `game_sessions` + `game_session_scores` and (when veto mode is on) clears all user vetoes.
- ✅ **Game Record Book** (`src/pages/miniapps/BoardGameRecords.tsx`) — Four tabs: Recent Plays (chronological feed with click-to-edit `SessionEditor`, plus "📷 From photo" and "📊 From Excel (experimental)" import buttons), Player Stats (sortable leaderboard with horizontal-bar chart of wins), Game Stats (per-game leaderboard with bar chart of most-played), Head-to-Head (two-player picker with win tally, mini bar chart, and full session history). Pure stats logic in `src/lib/gameStats.ts`. Fuzzy matching of imported game/player names to existing rows in `src/lib/importMatching.ts`. Charts via Recharts. Excel parsing via SheetJS (`xlsx`) client-side; Photo compressed client-side via canvas before send. `ImportPreview` component reviews proposed sessions before bulk insert.
- ✅ **Central Location Estimator** (`src/pages/miniapps/CentralLocation.tsx`) — Pre-populates attendees from active family members + their `profile.location`. Editable, with custom additions and "include?" checkbox. Optional context input. Calls `suggest-central-location` Edge Function (which uses Google Geocoding + Claude). Result card shows recommended city + airport + reasoning + per-attendee drive-time fairness note + alternates, plus an interactive Google Map (`src/components/LocationMap.tsx`) with attendee markers, destination diamond, geographic-centroid dot, and geodesic polylines connecting each attendee to the destination. Saved meet-ups stored in `central_location_queries` table for future reference.
- ✅ **Running Late / Early** (`src/pages/miniapps/RunningLateEarly.tsx`) — Three-button direction picker (🐢 Late / 🕐 On time / 🐰 Early), minute presets + custom input, optional event label with quick-fill from recent labels, optional note. Pinned "your latest ETA" card if you've posted in the last 24h. Color-coded family feed showing the past 24 hours by default with "Show older" toggle. Polls every 15s for new pings. Reads/writes `late_pings` table. Each insert also auto-creates a banner via the announcements trigger (see below).

## Home-page announcement banners

Reusable system for any cross-cutting "heads up" the family should see when they open the app.

**Schema:** `announcements` (id, source, source_id, sender_id, emoji, message, variant, link_path, expires_at, is_active) + `announcement_dismissals` (announcement_id, profile_id) for per-user hide. Defined in `supabase/schema-announcements.sql`.

**Component:** `src/components/AnnouncementBanner.tsx` — rendered at the top of `Home.tsx`. Polls every 30s. Each banner shows emoji, message, optional link to the source mini-app, an `✕` for per-user dismiss, and (for the original sender or any Dictator) a `Rescind` button that flips `is_active = false` for everyone.

**How a mini-app posts a banner:**
1. **Via DB trigger (cleanest):** like `create_announcement_for_late_ping()` — the trigger inserts a new announcement row whenever the source table gets a new row. Bonus: it also deactivates any prior active banner from the same sender so the home page doesn't pile up duplicates.
2. **Via client insert:** the frontend can `supabase.from('announcements').insert({ source: 'manual', sender_id, emoji, message, variant, link_path, expires_at })`.

**Variants** map to color schemes in the banner: `late` (amber), `early` (sky), `on_time` (emerald), `info` (purple), `warning` (warm), `success` (emerald). Add new variants by extending the `variantClass` map in the component.

**Future uses:** new poll opened (Voting Portal), new meeting proposal (Meeting Scheduler), NCAA round complete (NCAA Pool), manual heads-up posts ("Aunt Marie is in the hospital"). Each just inserts an announcement row with its own `source` and a relevant `link_path`.

## Edge Functions (server-side helpers)

These hold any secret API keys (e.g. `ANTHROPIC_API_KEY`) and are invoked from the frontend with `supabase.functions.invoke(name, { body })`. Each lives at `supabase/functions/<name>/index.ts`.

| Name | What it does | Used by |
|------|--------------|---------|
| `enrich-board-game` | Takes `{ name }`, calls Claude (Haiku, tool use) to return structured `{ confidence, min_players, max_players, typical_minutes, weight, tags, notes, canonical_name }`. | Board Game Picker → GameForm "Look it up" button. |
| `transcribe-game-photo` | Takes `{ imageBase64, mediaType }`, calls Claude (Haiku, vision + tool use) to return `{ sessions[], confidence, source_notes }`. Each session has `game_name`, `played_on`, `notes`, `players[]`. | Game Record Book → Recent Plays → "📷 From photo". |
| `parse-game-spreadsheet` | Takes `{ sheets[] }` (each a 2D cell array), calls Claude with the cells rendered as text and the same `record_game_sessions` tool. Returns suggested sessions across all sheets. | Game Record Book → Recent Plays → "📊 From Excel" (experimental). |
| `suggest-central-location` | Takes `{ locations: [{name, city}], context? }`. Geocodes each input via Google Geocoding API, computes mathematical centroid, reverse-geocodes to find the city at the centroid, then asks Claude (Haiku, tool use) to write reasoning + fairness note + alternates. Math is deterministic; Claude only handles prose. Requires `GOOGLE_MAPS_API_KEY` secret in addition to `ANTHROPIC_API_KEY`. | Central Location Estimator. |

**Pattern for adding new Claude-powered functions:**
1. Copy `enrich-board-game/index.ts` as a template.
2. Adjust the `recordTool` schema for whatever structured fields you want back.
3. Adjust the prompt in the `messages` array.
4. Deploy via dashboard or `supabase functions deploy <name>`.
5. Reuses the same `ANTHROPIC_API_KEY` secret — no extra setup needed once the first function is wired up.

## Things explicitly deferred

- **Push notifications** — the manifest is ready; we'll add `web-push` and a Supabase function once a mini-app needs it (likely Running Late/Early).
- **Photos / file uploads** — Supabase Storage bucket can be added later for plaques, profile avatars, and game session photos.
- **Service-role-key admin actions** (e.g. one-click guest invitations with expiration) — needs an Edge Function. For now, the dashboard's "Invite user" button is the answer.
- **Audit log** — there's no history table yet. If/when we want one, we'll add a `family_audit` table populated by triggers on each write.
- **Time zones** — assume profiles' birthdays etc. are date-only; meeting times will be timestamptz so they work across the family's time zones.
- **Custom PNG app icons** — currently using a single SVG. PNGs can be added to `public/icons/` later if the SVG doesn't render well on older iOS.

## Conventions

- One component per file. Pages under `src/pages/`, reusable parts under `src/components/`.
- Tailwind first; only break out `.css` for genuinely reusable classes (see the `.btn`, `.card`, etc. in `index.css`).
- New mini-app? Add the page, route, and home tile (see `README.md`).
- Database changes go into `supabase/schema.sql` so the file remains the source of truth and is re-runnable.
- Every new Supabase Edge Function lives at `supabase/functions/<name>/index.ts` (we'll create that directory when we build the first one).

## Why these choices

- **Magic link, no passwords.** The family won't enjoy "forgot password" flows; magic-link is friendlier and more secure for casual users.
- **First user = dictator** via DB trigger so the very first deploy is self-bootstrapping; you don't need to hand-edit the database to grant yourself admin.
- **"Dictator Mode" as the visible label** but `dictator` (lowercase) as the DB enum value. Keeps the data layer professional and the UX playful.
- **Deceased as a flag, not a delete.** Family memory is data; we preserve it.
- **Permissive RLS for mini-app tables** at start. We'll tighten policies (e.g. NYE predictions hidden until reveal) when we build each app.
