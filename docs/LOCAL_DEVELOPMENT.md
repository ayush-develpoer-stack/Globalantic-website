# Local development (Windows PowerShell)

Everything below runs on your machine against a **local** database. Nothing touches Supabase,
and no email is sent to real people.

## Ports

| App | URL | Workspace |
|---|---|---|
| API | http://localhost:4000/api (health: http://localhost:4000/health) | `backend` |
| Main website | http://localhost:3000 | `frontend` |
| Training | http://localhost:3001 | `training` |
| Intern portal | http://localhost:3002 | `intern` |
| Employee portal | http://localhost:3003 | `employee` |
| Admin portal | http://localhost:3004 | `admin` |
| Trainer portal | http://localhost:3005 | `trainer` |
| Local Postgres | 127.0.0.1:54320 (data in `%USERPROFILE%\.globalantic\dev-db`) | started by the API script |

There is no partner portal in this codebase yet (`partners.globalantic.com` has no app).

## First-time setup

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\Globalantic"
node -v          # needs Node 18.18+ (tested on 24)
npm install      # installs every workspace; the backend postinstall generates the Prisma client
```

`backend/.env` must exist (it holds `JWT_SECRET`, `HASH_SALT` and other secrets). Copy
`backend/.env.example` if it is missing. The portals need no secrets: their
`.env.development` files already point at `http://localhost:4000/api`.

## Start everything (one command)

```powershell
npm run dev:local -- --seed     # first run: also loads the [DEMO] accounts and data
npm run dev:local               # later runs
npm run dev:local -- admin employee   # API + only the apps you name
```

Ctrl+C stops all of them. Output is prefixed with the app name.

What `dev:local` does for the API (`backend/scripts/dev-local.ts`): starts an embedded
Postgres, applies all migrations, then runs the API with these values overridden **for that
process only** (your `.env` file is not changed):

- `DATABASE_URL`/`DIRECT_URL` → the local database
- `FRONTEND_URL` and every `*_URL` → the localhost portals above
- `COOKIE_DOMAIN` → unset (browsers reject a `.globalantic.com` cookie on localhost)
- `RESEND_API_KEY` → unset, so no email is sent; invite and reset links are printed in the API
  console, and the admin **Add user** dialog shows the set-password link instead. Set
  `$env:DEV_LOCAL_KEEP_EMAIL="1"` before starting to keep real email.

### Start apps one by one (separate terminals)

```powershell
npm run dev:backend:local -- --seed   # API + local DB (port 4000)
npm run dev:admin                     # 3004
npm run dev:employee                  # 3003
npm run dev:intern                    # 3002
npm run dev:trainer                   # 3005
npm run dev:training                  # 3001
npm run dev:frontend                  # 3000
```

Use another API port if 4000 is busy: `$env:PORT="4100"; npm run dev:backend:local`
(then start a portal with `$env:NEXT_PUBLIC_API_URL="http://localhost:4100/api"`).

> **Careful:** `npm run dev:backend` (without `:local`) uses `backend/.env` as is, which points
> at the **production** Supabase database and production URLs. Use it only when you mean to.

## Demo accounts (local database only)

Password for all: `DemoPass123`

| Email | Role | Sign in at |
|---|---|---|
| admin@example.test | Admin + **Super Admin** (local only) | http://localhost:3004 |
| finance@example.test | Finance | http://localhost:3004 |
| trainer@example.test | Trainer | http://localhost:3005 |
| student@example.test, student2@example.test | Intern / student | http://localhost:3002 |

## Try the user-management flow

1. Sign in to the admin portal as `admin@example.test`.
2. **Users & roles → Add user**. Pick a role (Employee, Intern, Trainer, HR, Sales, Finance,
   Editor, or Administrator), fill in the form, **Create & invite**.
3. Locally no email is sent, so the dialog shows a **set-password link**. Open it, choose a
   password, then sign in at the portal shown for that role.

## Checks

```powershell
npm --workspace backend run typecheck
npm --workspace backend run lint
npm --workspace backend test                      # whole suite (embedded Postgres per file; slow)
npm --workspace backend test -- user-management   # one file
npm --workspace admin run typecheck; npm --workspace admin run lint
```

Build a portal without disturbing a running `next dev` (it shares `.next`):

```powershell
cd admin
$env:NEXT_DIST_DIR=".next-verify"; npx next build
git checkout -- tsconfig.json next-env.d.ts   # next build edits these; revert afterwards
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login "works" but you are bounced back to the login page | The API sent `Domain=.globalantic.com` on localhost. Fixed in the API (the Domain is only sent when the request host is inside it). Restart the API. |
| `EADDRINUSE :4000` | Another API is already running (for example an older `npm run dev`). Stop it or use `$env:PORT="4100"`. |
| "Network error" in a portal | The API is not running, or the portal's `NEXT_PUBLIC_API_URL` points elsewhere. Check http://localhost:4000/health. |
| `/health` says `schema: "behind"` | Migrations not applied to that database. `dev:local` applies them automatically; for production see `docs/DEPLOYMENT.md`. |
| Internal Server Error (500) from a portal in dev | Usually a corrupted `.next` from running `next build` in the same folder as a running `next dev`. Stop the dev server, delete that app's `.next`, start again. |
| Local Postgres won't start | Another copy is running on 54320, or the data folder is locked. Close other `dev:local` windows. |
