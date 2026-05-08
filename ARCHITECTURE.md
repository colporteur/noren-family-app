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
- ✅ **Game Record Book** (`src/pages/miniapps/BoardGameRecords.tsx`) — Four tabs: Recent Plays (chronological feed with click-to-edit `SessionEditor`), Player Stats (sortable leaderboard with horizontal-bar chart of wins), Game Stats (per-game leaderboard with bar chart of most-played), Head-to-Head (two-player picker with win tally, mini bar chart, and full session history). Pure stats logic in `src/lib/gameStats.ts`. Charts via Recharts. Each session can have score and placement updated after the fact; `placement = 1` means "won" (multiple winners allowed for ties or co-op games).

## Edge Functions (server-side helpers)

These hold any secret API keys (e.g. `ANTHROPIC_API_KEY`) and are invoked from the frontend with `supabase.functions.invoke(name, { body })`. Each lives at `supabase/functions/<name>/index.ts`.

| Name | What it does | Used by |
|------|--------------|---------|
| `enrich-board-game` | Takes `{ name }`, calls Claude (Haiku, tool use) to return structured `{ confidence, min_players, max_players, typical_minutes, weight, tags, notes, canonical_name }`. | Board Game Picker → GameForm "Look it up" button. |

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
