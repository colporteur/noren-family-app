# The Noren Family App

A private PWA for the Noren family. Magic-link sign-in, role-based "Dictator Mode," a directory of family members, and a home page that links to nine mini-apps (some built, some on the build list).

Built with **React + Vite + TypeScript + Tailwind + Supabase + vite-plugin-pwa**.

---

## What you'll need

1. A free [Supabase](https://supabase.com) account
2. A free [Vercel](https://vercel.com) account (or any static host — Supabase Hosting, Netlify, Cloudflare Pages all work)
3. [Node.js 20+](https://nodejs.org)
4. A GitHub account (recommended, for deploying via Vercel)

---

## First-time setup

### Step 1 — Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com), click **New project**.
2. Pick a name (e.g. `noren-family-app`), set a database password, choose a region near you.
3. When the project is ready, go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (long `eyJ...` string — this one is safe to ship to the browser)

### Step 2 — Run the schema

1. In Supabase, open **SQL Editor → New Query**.
2. Copy the contents of `supabase/schema.sql` from this repo and paste it in.
3. Click **Run**. You should see `Success. No rows returned`.

This creates the `profiles` table, all the mini-app tables, RLS policies, and a trigger that automatically makes the **first** user a `dictator`.

### Step 3 — Configure auth

1. Supabase → **Authentication → Sign In / Providers** (under the CONFIGURATION section in the sidebar). Make sure **Email** is enabled (it is by default).
2. Supabase → **Authentication → URL Configuration**. Set the **Site URL** to your main URL and add any others to the **Redirect URLs** list:
   - For local dev: `http://localhost:5173`
   - For production: your Vercel URL (e.g. `https://noren-family.vercel.app`)
3. The "Total: N users (estimated)" line at the bottom of the Users page is just Supabase's free-tier capacity hint — ignore it; it doesn't mean you already have users.

### Step 4 — Run it locally

```bash
npm install
cp .env.example .env.local
# Open .env.local and paste your Supabase URL + anon key
npm run dev
```

Open http://localhost:5173 and sign in with your email. Click the magic link. Because you're the first user, the trigger makes you a **Dictator**. Open Dictator Mode → Manage Family to promote your mom (after she signs in once).

### Step 5 — Deploy to Vercel

1. Push this folder to a new GitHub repo (private!).
2. In Vercel, click **Add New → Project** and import the repo.
3. Vercel will auto-detect Vite. Before deploying, click **Environment Variables** and add:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key
4. Click **Deploy**.
5. After it's live, go back to **Supabase → Auth → URL Configuration** and add the Vercel URL to both fields.

That's it. Everyone in the family can now visit the URL and sign in with their email.

### Installing the PWA on a phone

- **iPhone**: open the URL in Safari → Share → "Add to Home Screen."
- **Android**: open the URL in Chrome → menu → "Install app."

The icon will look like the family `N` and it'll launch in standalone mode (no browser chrome).

---

## Daily use

- **First user signs in** → automatically becomes a Dictator.
- **Anyone else signs in** → becomes a Family Member. A Dictator can change their role from **Dictator Mode → Manage Family**.
- **Add a guest** → just send them the URL; they sign in, and you change their role to Guest in Manage Family.
- **Mark someone deceased** → Manage Family → "Mark deceased…" button. Their account stays intact (preserving their game scores, predictions, etc.) but they're shown with a memorial badge and excluded from active views by default.

---

## Project structure

```
src/
  main.tsx              # React entry point
  App.tsx               # Routes
  index.css             # Tailwind + a few utility classes
  contexts/AuthContext  # Session + profile state
  lib/supabase.ts       # Supabase client
  lib/types.ts          # Shared types (Profile, FamilyRole, etc.)
  components/           # Layout, ProtectedRoute, DictatorOnly, RoleBadge, ComingSoon
  pages/                # Login, Home, FamilyDirectory, ProfilePage
  pages/DictatorMode/   # Admin tools (manage members, invite guest)
  pages/miniapps/       # All 9 mini-app pages (placeholders for now)
supabase/
  schema.sql            # Run this in the SQL editor — idempotent
public/
  favicon.svg           # The N gradient logo (also used as PWA icon)
```

---

## Adding more mini-apps later

The home page reads from a list at the top of `src/pages/Home.tsx`. To add a tenth mini-app:

1. Create the page component under `src/pages/miniapps/`.
2. Add a route to `src/App.tsx`.
3. Add a tile to the `apps` array in `src/pages/Home.tsx`.

---

## Setting up the Claude API key (for game lookup, Central Location, etc.)

Several mini-apps call Claude server-side so the API key stays secret. The first one that uses it is the Board Game Picker's "✨ Look it up" button, which auto-fills game details from just a name. The setup below is one-time; future Claude-powered features will reuse the same key.

### One-time setup

1. **Get an Anthropic API key** at [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys → Create Key. Copy the `sk-ant-...` value.

2. **Add it as a Supabase secret.** Two paths:

   **(a) Dashboard (easiest, no CLI needed):** Supabase → Project Settings → Edge Functions → **Manage Secrets** → click **Add new secret** → Name: `ANTHROPIC_API_KEY`, Value: `sk-ant-...`. Save.

   **(b) CLI:** if you've installed the Supabase CLI (`npm install -g supabase`), then from the project folder:
   ```bash
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Deploy the Edge Functions.** Three functions to deploy. All read the same `ANTHROPIC_API_KEY` secret. For each:

   **(a) Dashboard:** Supabase → Edge Functions → **Deploy a new function** → name it exactly as listed → paste the contents of `supabase/functions/<NAME>/index.ts` into the editor → click Deploy.

   **(b) CLI:** `supabase functions deploy <NAME>`

   The functions:
   - **`enrich-board-game`** — game-name → structured details (used by the Board Game Picker's "✨ Look it up" button).
   - **`transcribe-game-photo`** — photo of a scoresheet → suggested session (used by the Game Record Book's "📷 From photo" button). Multimodal — uses Claude's vision capability.
   - **`parse-game-spreadsheet`** — uploaded Excel cells → suggested batch of sessions (used by the Game Record Book's "📊 From Excel" button, **experimental**).

4. **Test it.** In the app, open Board Game Picker → The Shelf → Add a game → type a name like `Catan` → click **✨ Look it up**. The other fields should fill in within a couple of seconds. Then try Game Record Book → Recent Plays → "📷 From photo" with any photo of a scoresheet.

### Cost note

Each lookup uses Claude Haiku (the smallest, fastest, cheapest model) and a tiny prompt — well under one cent per lookup. Filling in 100+ games once costs pennies.

---

## Notes

- This app is "family-private" by design: anyone with a Supabase account on this project can read other family members' directory info. RLS keeps your data scoped to authenticated users only.
- All mini-app SQL tables already exist (RLS enabled, signed-in users can read/write). When we build each mini-app's UI, we'll tighten the policies if needed (e.g., NYE predictions hidden until the answer reveal).
- The PWA uses a single SVG icon for now. If you want crisp PNG icons on older iOS devices, drop 192×192 and 512×512 PNGs into `public/icons/` and add them back to the `manifest` block in `vite.config.ts`.
- See `ARCHITECTURE.md` for the longer-term vision and per-mini-app design notes.
