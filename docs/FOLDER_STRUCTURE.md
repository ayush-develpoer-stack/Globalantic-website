# GLOBALANTIC — FOLDER STRUCTURE

Flat, root-level monorepo. One app per top-level folder, one backend, one database, one set of shared packages. Managed with **npm workspaces + Turborepo**.

```
Globalantic/
├── frontend/     Main IT-services website  → globalantic.com          (public)   :3000
├── training/     Training & admissions       → training.globalantic.com (public)   :3001
├── intern/       Intern portal               → intern.globalantic.com   (private)  :3002
├── employee/     Employee HR portal          → employee.globalantic.com (private)  :3003
├── admin/        Central management          → admin.globalantic.com    (private)  :3004
├── trainer/      Trainer portal              → trainer.globalantic.com  (private)  :3005
├── backend/      Express REST API            → api.globalantic.com                 :4000
│   └── src/{config,controllers,services,routes,middleware,validators,utils}
│       (+ integrations/ and modules/ added incrementally as features land)
├── packages/     Shared code (no portal-specific business logic)
│   ├── ui/         Shared UI primitives (extracted from frontend kit over time)
│   ├── types/      Shared domain + API types (Role, ApiResponse, AuthUser, …)
│   ├── auth/       Portal-access helpers (canAccessPortal, role→portal map)
│   ├── validation/ Shared Zod schemas (re-exported to portals + backend)
│   ├── config/     Domains (from env), design tokens
│   └── utils/      Common helpers (cn, formatINR, …)
├── prisma/       Single Prisma schema + seed + migrations (one Supabase DB)
│   ├── schema.prisma
│   ├── seed.ts
│   ├── data/
│   └── migrations/
├── docs/         All project documentation
├── package.json  Workspaces + Turborepo scripts
├── turbo.json    Turborepo pipeline
├── tsconfig.json Root base TS config
├── .gitignore
└── README.md
```

## Each Next.js app
```
<app>/
├── app/          App Router routes (+ globals.css)
├── components/   App-specific components
├── lib/          App-specific data/API helpers (calls the central backend)
├── hooks/        App-specific React hooks
├── types/        App-specific types (shared ones live in packages/types)
├── styles/       App-specific styles
├── public/       Static assets
├── package.json
├── tsconfig.json
└── next.config.mjs
```

## Conventions
- **One backend, one database, one auth.** No per-portal backends or databases.
- Private portals (`intern`, `employee`, `admin`, `trainer`) require authentication; the **backend API is the final authority** on access and ownership. Frontend guards are defense-in-depth.
- Secrets live only in `backend/.env`. Frontend apps get **public** `NEXT_PUBLIC_*` vars only.
- Shared, reusable code → `packages/*`. Portal-specific business logic stays in that portal.
- Ports above are dev defaults; production uses subdomains via env vars.
