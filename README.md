# Collins Aerospace HR Platform

A production-grade HR information system (HRIS) for Collins Aerospace, an RTX business — a single home
for people, time off, pay, benefits, performance, hiring and growth.

Built as a TypeScript monorepo with a Fastify + Drizzle API, a React 19 + Vite web
app, and a shared domain/validation layer. Role-based access control (RBAC) gates
every route and view across six roles.

## Architecture

```
collins-hr/
├── apps/
│   ├── api/        Fastify + Drizzle ORM REST API (JWT auth, RBAC, SQLite/Turso)
│   └── web/        React 19 + Vite + Tailwind SPA (TanStack Query, React Router)
├── packages/
│   └── shared/     Zod schemas, domain types & RBAC permission matrix
└── .github/        CI (lint, typecheck, unit/integration tests, build, e2e)
```

- **Shared layer** (`@collins-hr/shared`) is the single source of truth for domain
  types, request/response schemas (Zod) and the RBAC permission matrix. Both the
  API and the web app import from it, so the contract can never drift.
- **API** is a set of decoupled Fastify route plugins (one per HR module) over a
  service layer. Auth is JWT; every handler is guarded by fine-grained
  `resource:action:scope` permissions.
- **Web** is a single-page app. Server state is handled with TanStack Query;
  navigation and every page are permission-aware via the auth context.

## HR modules

Directory & org chart · Time off & approvals · Timesheets · Payroll & payslips ·
Benefits enrollment · Performance (goals & reviews) · Recruiting/ATS · Onboarding ·
Learning & development · Documents & e-signature · Analytics · Notifications.

## Roles

`employee` · `manager` · `recruiter` · `hr_admin` · `executive` · `super_admin`

## Prerequisites

- Node 20 (see `.nvmrc`)
- pnpm 9 (`corepack enable` or `npm i -g pnpm@9.15.1`)

## Getting started

```bash
pnpm install

# build the shared package (API & web depend on its types)
pnpm --filter @collins-hr/shared build

# create the API env file and a local SQLite database with seed data
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:seed

# run API (http://localhost:4000) and web (http://localhost:5173) together
pnpm dev
```

### Demo accounts

After seeding, every account below uses the password `Password123!`:

| Role       | Email                     |
| ---------- | ------------------------- |
| HR Admin   | hr.admin@collins.com      |
| Manager    | manager@collins.com       |
| Employee   | employee@collins.com      |
| Recruiter  | recruiter@collins.com     |
| Executive  | troy.brunk@collins.com  |
| Super admin| admin@collins.com         |

## Scripts

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Run API + web in watch mode                        |
| `pnpm build`       | Build shared, then API and web                     |
| `pnpm lint`        | ESLint across all packages                         |
| `pnpm typecheck`   | TypeScript project checks across all packages      |
| `pnpm test`        | Vitest unit/integration tests                      |
| `pnpm e2e`         | Playwright end-to-end tests                         |
| `pnpm db:migrate`  | Apply Drizzle migrations                            |
| `pnpm db:seed`     | Seed realistic demo data                            |
| `pnpm db:reset`    | Drop and recreate the local database                |

## Testing

- **Unit & integration:** Vitest. The API has integration tests that exercise the
  real Fastify app against an in-memory database.
- **End-to-end:** Playwright drives the built web app against the running API,
  covering auth, the employee directory and the time-off request workflow.
- **CI:** GitHub Actions runs lint, typecheck, tests, build and the full e2e suite
  on every pull request.

## Database

Local development uses an embedded SQLite file (`apps/api/local.db`). Production
targets [Turso](https://turso.tech) (libSQL) — set `DATABASE_URL` and
`DATABASE_AUTH_TOKEN` in the API environment.
