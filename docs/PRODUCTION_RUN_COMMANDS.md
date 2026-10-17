# Production Run Commands (Windows PowerShell)

Every script, port and endpoint below exists in the repository and was used during the 2026-10-17 audit, unless marked **NOT RUN**.

Values marked `<…>` depend on your environment.

> ⚠ `backend/.env` points at the **production Supabase database**. Anything that starts the backend locally with that file reads and writes production data. For an isolated run, see §8.

Run everything from the repository root:
```powershell
Set-Location "C:\Users\Hp 440 G7\OneDrive\Desktop\Globalantic"
```

## 1. Stop local dev/test processes safely
Identify what owns each port *before* stopping anything:
```powershell
$ports = 3000,3001,3002,3003,3004,3005,4000
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  ForEach-Object {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
    [pscustomobject]@{ Port = $_.LocalPort; PID = $_.OwningProcess; Command = $p.CommandLine }
  } | Format-Table -AutoSize -Wrap
```
Stop only the PIDs whose command line is this project's `next`, `tsx` or `node dist/server.js`:
```powershell
Stop-Process -Id <PID> -Confirm:$false
```
A `node` process on a port **not** in the list above is not ours; leave it alone. Port 5432 is the separate Windows PostgreSQL service and 3306 is MySQL, so don't touch them.

## 2. Install dependencies reproducibly
```powershell
node -v      # audited with v24.12.0 (package.json engines: >=18.18.0)
npm -v       # packageManager: npm@11.6.2
npm ci       # root lockfile; installs every workspace
```
`npm ci` was **NOT RUN** in this audit, because it deletes and reinstalls `node_modules` (the existing install was used). Close VS Code and every dev server first: OneDrive and running processes lock Prisma's engine DLL.

Then:
```powershell
npm run prisma:generate
```

## 3. Checks and tests
```powershell
foreach ($w in 'packages/types','packages/api-client','packages/ui','packages/auth','packages/config','packages/utils','packages/validation') { npm --workspace $w run typecheck }
foreach ($w in 'backend','frontend','training','intern','employee','admin','trainer') { npm --workspace $w run typecheck; npm --workspace $w run lint }
npm --workspace backend test          # embedded PostgreSQL, never Supabase (several minutes)
npm --workspace backend test -- payments   # one file (name filter)
npm --workspace frontend test
$env:DATABASE_URL='postgresql://x:x@127.0.0.1:1/x'; $env:DIRECT_URL=$env:DATABASE_URL; npx prisma validate --schema prisma/schema.prisma; Remove-Item Env:DATABASE_URL, Env:DIRECT_URL
```
Run the full backend suite on its own. On this 8 GB machine, one test file (`referral`) failed once under load and passed when rerun alone.

## 4. Build every production application
The frontends need the public API URL **at build time**, because it is baked into the bundle. A production build without it stops with a clear error.
```powershell
npm run build:backend                                  # tsc -> backend/dist
$env:NEXT_PUBLIC_API_URL = '<https://api.globalantic.com/api>'
foreach ($a in 'frontend','training','intern','employee','admin','trainer') {
  npm --workspace $a run build
  if ($LASTEXITCODE -ne 0) { Write-Error "$a build failed"; break }
}
Remove-Item Env:NEXT_PUBLIC_API_URL
```
Other public build variables (set them in the hosting project; see `docs/ENVIRONMENT_CONFIGURATION.md`):
- `NEXT_PUBLIC_SITE_URL` (frontend);
- `NEXT_PUBLIC_TRAINING_URL`, `NEXT_PUBLIC_INTERN_PORTAL_URL`, `NEXT_PUBLIC_MAIN_SITE_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_TRAINER_URL` (training);
- `ALLOW_INDEXING=true` for an indexable production build of the public sites. Indexing is otherwise on only when `VERCEL_ENV=production`.

Build one app at a time on low-memory machines. `frontend` takes about 3 minutes; each portal about 1 minute.

## 5. Start each application in production mode
Backend: `npm start` = `node dist/server.js`, run in `backend/` so it reads `backend/.env`. Production needs these variables:
- `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `HASH_SALT`;
- `FRONTEND_URL`, `PUBLIC_API_URL`, `MAIN_SITE_URL`, `TRAINING_URL`, `INTERN_PORTAL_URL`, `EMPLOYEE_PORTAL_URL`, `ADMIN_PORTAL_URL`.

The API refuses to boot without them.
```powershell
$env:NODE_ENV = 'production'
npm --workspace backend start            # PORT from env (default 4000)
```
Frontends (separate terminals). These are the `start` scripts in each `package.json`:
```powershell
npm --workspace frontend start   # next start          -> :3000
npm --workspace training start   # next start -p 3001
npm --workspace intern   start   # next start -p 3002
npm --workspace employee start   # next start -p 3003
npm --workspace admin    start   # next start -p 3004
npm --workspace trainer  start   # next start -p 3005
```

## 6. Health and critical API checks
```powershell
Invoke-RestMethod http://localhost:4000/health/live          # process up
Invoke-WebRequest http://localhost:4000/health -SkipHttpErrorCheck | Select-Object StatusCode, Content
#   200 {"status":"ok","database":"up","schema":"current","pendingMigrations":0}
#   503 database "down" -> DB unreachable;  503 schema "behind" -> run prisma:deploy first
Invoke-RestMethod http://localhost:4000/api/services | Select-Object success
Invoke-WebRequest http://localhost:4000/api/auth/me -SkipHttpErrorCheck | Select-Object StatusCode   # 401 without a session
```
`-SkipHttpErrorCheck` needs PowerShell 7 (`pwsh`). In Windows PowerShell 5.1, wrap `Invoke-WebRequest` in `try { } catch { $_.Exception.Response.StatusCode }`.

Migration state against the real DB (read-only):
```powershell
Set-Location backend; npx prisma migrate status --schema=../prisma/schema.prisma; Set-Location ..
```
Apply pending migrations **only with approval, after a backup** (`backend/scripts/migration-rehearsal.ts`):
```powershell
npm run prisma:deploy
```

## 7. Stop production test processes
Use §1 to find each PID by port and command line, then `Stop-Process -Id <PID>`. On Windows this is a hard stop.

The graceful path (SIGTERM → close the SSE streams → drain → disconnect Prisma, forced after 10 s) applies on Linux hosts such as Render and Railway, and with Ctrl+C in the terminal.

## 8. Isolated production-mode test (what this audit ran)
This uses a throwaway embedded PostgreSQL and never Supabase. The helper scripts are in the audit session's scratchpad, and they follow the same pattern as `backend/scripts/dev-db.ts`.
1. Start an empty local DB and migrate + seed it:
   ```powershell
   npm run dev:db
   ```
   This runs on :54320, and the demo accounts use the password `DemoPass123`.
2. Start the backend against it. Set **every** key that `backend/.env` defines, so dotenv cannot fill in production values:
   ```powershell
   $env:NODE_ENV='production'; $env:PORT='4100'
   $env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54320/globalantic_dev'; $env:DIRECT_URL=$env:DATABASE_URL
   $env:JWT_SECRET='<local-random-32+chars>'; $env:HASH_SALT='<local-random>'
   $env:RESEND_API_KEY=''; $env:CLOUDINARY_API_KEY=''; $env:CLOUDINARY_API_SECRET=''; $env:CLOUDINARY_CLOUD_NAME=''
   $env:RAZORPAY_KEY_ID=''; $env:RAZORPAY_KEY_SECRET=''; $env:RAZORPAY_WEBHOOK_SECRET=''
   $env:FRONTEND_URL='http://localhost:3100,http://localhost:3101,http://localhost:3102,http://localhost:3103,http://localhost:3104,http://localhost:3105'
   $env:MAIN_SITE_URL='http://localhost:3100'; $env:TRAINING_URL='http://localhost:3101'; $env:INTERN_PORTAL_URL='http://localhost:3102'
   $env:EMPLOYEE_PORTAL_URL='http://localhost:3103'; $env:ADMIN_PORTAL_URL='http://localhost:3104'; $env:PUBLIC_API_URL='http://localhost:4100/api'
   $env:ADMIN_EMAIL='ops@example.test'; $env:SEED_ADMIN_PASSWORD='DemoPass123'
   Set-Location backend; node dist/server.js
   ```
3. Build into a separate dist dir, so your dev `.next` is untouched:
   ```powershell
   $env:NEXT_DIST_DIR='.next-verify'; $env:NEXT_PUBLIC_API_URL='http://localhost:4100/api'; npm --workspace <app> run build
   ```
   Next adds `.next-verify` to that app's `tsconfig.json` `include` and rewrites `next-env.d.ts`, so restore both with `git checkout -- tsconfig.json next-env.d.ts` inside the app.
4. Start the build from inside the app folder:
   ```powershell
   $env:NEXT_DIST_DIR='.next-verify'; npx next start -p 31xx -H 127.0.0.1
   ```
