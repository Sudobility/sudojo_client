# CLAUDE.md

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or any `push_all` script **only when the user
> explicitly asks in that turn**. Approval for an earlier change does not carry forward.
> Stay on the current branch (this repo has only `main`); do not create feature branches.

Context for AI assistants. Full endpoint → method → hook map lives in [docs/API.md](docs/API.md);
don't duplicate it here.

## What this is

`@sudobility/sudojo_client` is the TypeScript API-client library for the Sudojo API (`sudojo_api`):
the integration layer between the Sudoku apps and the backend. Single package (not a monorepo); no
runtime code outside `src/`. It provides:

- **`SudojoClient` class**: 79 typed methods, one per `sudojo_api` route.
- **React Query hooks**: 78 `useSudojo*` (15 `use-sudojo-*.ts` files) + 6 `useSolver*`. Every client
  method has a hook, and hooks are the intended public surface.
- **Solver** (`/api/v1/solver/*` proxy to `sudojo_solver`), **solution decryption** (AES-256-GCM) for
  `enc:` `solution` fields, **query-key factories**, `STALE_TIMES`, and cache-invalidation utilities.

```
 sudojo_app / sudojo_app_rn / sudojo_extension / sudojo_lib / sudojo_bot
                     │  hooks (apps/lib) or SudojoClient via ./network (bot)
                     ▼
 @sudobility/sudojo_client ── NetworkClient (injected, from @sudobility/types)
                     │  HTTP  Authorization: Bearer <Firebase ID token>
                     ▼
 sudojo_api  (Hono, /api/v1/...)  ── /api/v1/solver/* proxies ──▶ sudojo_solver
```

## Commands

**Uses Bun** (lockfile `bun.lock`). Do not use npm, yarn, or pnpm. There is **no `test` script**.

```bash
bun install             # Install dependencies (needs .npmrc GitHub Packages registry — below)
bun run build           # tsc -p tsconfig.build.json → dist/, then scripts/fix-esm-imports.mjs
bun run build:watch     # tsc --watch (uses tsconfig.json); clean = rm -rf dist
bun run test:run        # vitest run (single pass; 8 test files). test:unit is an alias; test:watch watches
bun run test:coverage   # vitest run --coverage → coverage/ (no threshold; report only)
bun run typecheck       # tsc --noEmit
bun run lint            # eslint src --ext .ts,.tsx (flat config; runs prettier/prettier). lint:fix to autofix
bun run format          # prettier --write "src/**/*.ts" (shallow glob — see Gotchas); format:check to verify
bun run check-all       # lint + typecheck + test:unit
bun run verify          # check-all + build
```

`.npmrc` must set `@sudobility:registry=https://npm.pkg.github.com` (GitHub Packages). `dist/` is
gitignored and may be stale locally.

## Tech stack

| Area | Choice |
|---|---|
| Runtime / PM | Bun 1.x |
| Language | TypeScript 6.x (dev `~6.0.3`; `target ES2020`, ESM `"type":"module"`, `moduleResolution: bundler`, very strict, `tsconfig` sets `ignoreDeprecations: "6.0"`) |
| Data fetching | `@tanstack/react-query` v5 (peer `>=5.0.0`; dev/locked 5.104.5) |
| Tests | Vitest 4 + happy-dom, `globals: true`. `@sudobility/di/mocks` `MockNetworkClient` for client tests |
| Lint / format | ESLint 10 flat config (`eslint.config.js`) + Prettier 3 via `eslint-plugin-prettier` |
| CI | `.github/workflows/ci-cd.yml` → `johnqh/workflows/.github/workflows/unified-cicd.yml@main` (`publish-target: github`) |

## Layout

```
src/
├── index.ts         # Package entry — the ONLY public surface (named exports)
├── errors/          # HintAccessDeniedError (HTTP 402; dead path — see note)
├── network/         # sudojo-client.ts: SudojoClient (79 methods), createApiConfig ENDPOINTS,
│                    #   createURLSearchParams, bitmaskQueryValue, solution decryption.
│                    # fetch-network-client.ts: createAuthenticatedFetchClient (hosts w/o a
│                    #   NetworkClient). index.ts: ./network entry (SudojoClient, no React)
├── hooks/           # 78 hooks; query-keys.ts (queryKeys.sudojo.*), query-config.ts (STALE_TIMES),
│                    #   15 use-sudojo-*.ts (health, levels, techniques, learning, boards, dailies,
│                    #   challenges, examples, users, practices, communities, strategies,
│                    #   gamification, ocr, invalidation)
└── solver/          # index.ts re-exports solver hooks + solver TYPES (NOT re-exported by
                     #   src/index.ts); hooks/use-solver.ts: useSolver{Solve,Validate,Generate}+*Mutation
docs/API.md  plans/IMPROVEMENTS.md (dated)  scripts/fix-esm-imports.mjs  (every dir has __tests__/)
```

## Public API surface (`src/index.ts`)

Barrel, named exports only. Two `exports` entries: `.` (`dist/index.js`, hooks included — needs
React + react-query) and `./network` (`dist/network/index.js`, `SudojoClient` only — used by Node
consumers like `sudojo_bot`). Anything not in `src/index.ts` or `src/network/index.ts` is private.
Besides the hooks it exports: `SudojoClient` + `createSudojoClient` (`@deprecated` at the root entry
only — use hooks; `./network` is **not** deprecated; `tsconfig.build.json` sets
`removeComments: false` so `@deprecated` JSDoc reaches `dist/*.d.ts`), `configureSolutionKey`,
`isValidUUID`, `validateUUID`, `HintAccessDeniedError`, the query utils (`queryKeys`,
`createQueryKey`, `getServiceKeys`, `STALE_TIMES`, `solverQueryKeys`, `getSolverServiceKeys`,
`SOLVER_STALE_TIMES`), and local types pending upstream (`ValidateOptions` adds `brutalForce`,
`SolveOptions`, `GenerateOptions`, `DeletedData`, `DeleteUserRequest`, `QueryKey`, …). Full list:
docs/API.md.

Hooks-only rule: all network logic is exposed as hooks; sudojo_lib and the apps call hooks and never
construct `SudojoClient`. New hooks must be exported from **both** `src/hooks/index.ts` and
`src/index.ts` (and get a docs/API.md row).

## Key patterns

**Query hook shape:** `(networkClient, baseUrl, token?, ...params, options?)`. Builds a fresh
`SudojoClient` per `(networkClient, baseUrl)` via `useMemo` — pass stable references. `enabled` is
always applied last so callers can't bypass the param/token gate. Token-gated query hooks:
`useSudojoUser`, `useSudojoUserSubscription`, `useSudojoGamificationStats`, `useSudojoPointHistory`;
all others run without a token. **Mutation hooks** take `(networkClient, baseUrl)`, called
`mutate({ token, ... })`, and invalidate the resource prefix on success (updates also invalidate the
item key; deletes `removeQueries` it).

**Query-key hierarchy:** root `["sudojo"]`; solver keys under `["sudojo","solver"]`. Filter-taking
factories append the filter slot (`boards()` → `["sudojo","boards",undefined]`). To invalidate a
whole resource use the prefix `[...queryKeys.sudojo.all(), "boards"]`, not `boards()` — that's what
the built-in mutations and `useSudojoInvalidation` do.

**Auth / baseUrl:** `token` (Firebase ID token) is a per-call arg, never stored; sent as
`Authorization: Bearer` only when truthy. `baseUrl` is the API **origin** (e.g.
`https://api.sudojo.com`) — endpoints already include `/api/v1` and health is `GET /`, so a trailing
slash or `/api/v1` suffix breaks URLs. Only `networkClient.request()` is used; `request()` ignores
`response.ok` (non-2xx bodies resolve as data unless the NetworkClient throws).
`createAuthenticatedFetchClient({ getToken, refreshToken?, onForbidden?, fetch? })` is for hosts
without their own NetworkClient (sudojo_app_rn): force-refresh+retry once on 401, `onForbidden` on
403, non-2xx resolves `{ ok: false }`.

**Solution decryption:** `await configureSolutionKey(hexKey)` once at startup (`""`/unset = no-op).
Every response is walked; any `solution` string starting with `enc:` is decrypted via WebCrypto
(module-global key; wrong key → `subtle.decrypt` throws and the request rejects).

**Solver:** `solverSolve`/`solverValidate` use 120 s timeouts; `regeneratePracticeHints` 600 s.
Solver query params are sorted alphabetically with commas left unencoded. `SolveOptions.techniques`
is a comma-separated id list (`"1,2,60"`), **not** a bitmask. `solverSolve` throws
`HintAccessDeniedError` on 402 + `code HINT_ACCESS_DENIED`, but this is a **dead path**: `sudojo_api`
never sends a 402 (marked `@deprecated`, kept until a breaking release).

**Technique bitmasks are decimal strings, never JS numbers.** Bit N = technique id N (ids 1–60); a
mask with id ≥ 54 exceeds 2^53 and a JS `number` silently drops bits. Wire format is a base-10
string, with `bigint` for math. On requests format masks with `bitmaskQueryValue` (strings & bigints
pass through, integers via `BigInt(n)`) — never `String(n)`. Keys carry masks as strings (React Query
hashes keys with `JSON.stringify`, which throws on bigint). `src/` does not yet import the sudojo_types
BigInt helpers (`techniqueBitmaskOf`, `formatTechniqueBitmask`, …), so typecheck/tests pass regardless
of the installed sudojo_types version.

**Stale times (`STALE_TIMES` / `SOLVER_STALE_TIMES`):** 10 min reference data; 5 min boards/dailies/
challenges/examples/user; 2 min subscription+gamification; 1 min health + solver-solve; 0 for
random/counts/point-history + solver-generate; `Infinity` for `useSudojoRandomBoard` (new puzzle only
via `refetch()`). Exact table in docs/API.md.

## Cross-repo contracts

| Contract | Keep in sync with |
|---|---|
| `ENDPOINTS` paths, methods, query-param names | `sudojo_api/src/routes/*.ts` (mounted at `/api/v1`) |
| Request/response types | `sudojo_types/src/index.ts`; bump the sudojo_types range here when adopting new types |
| `enc:` format (AES-256-GCM, 12-byte nonce, base64) | `sudojo_api/src/lib/solution-crypto.ts`; apps pass the same hex key (e.g. sudojo_app `VITE_SOLUTION_KEY`) |
| Level range | sudojo_types `isValidLevel` / `MIN_LEVEL` / `MAX_LEVEL` |
| Technique bitmask decimal strings | sudojo_api (returns 400 on bad input) + sudojo_types BigInt helpers |
| Local types pending upstream | `ValidateOptions.brutalForce`, `DeletedData`, `DeleteUserRequest` — `TODO(sudojo_types)` in sudojo-client.ts |

Sibling deps (peer **and** dev; no runtime `dependencies` section): `@sudobility/sudojo_types`
`^1.2.80`, `@sudobility/types` `^1.9.78`, `@sudobility/di` `^1.5.85` (di used only by tests via
`@sudobility/di/mocks`). Renaming/removing any export breaks consumers (sudojo_app, sudojo_app_rn,
sudojo_extension, sudojo_lib, sudojo_bot).

## Conventions

- Named barrel exports only. Hooks `useSudojo*` / `useSolver*`; constants `UPPER_SNAKE_CASE`;
  JSDoc on public functions. Tests live in `__tests__/` next to the code.
- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noUnusedLocals/Parameters` (unused must be `_`-prefixed). Optional params typed `T | undefined`.
- Prettier: double quotes, semicolons, trailing-commas-all, 80 cols, 2 spaces, LF. ESLint adds
  `sort-imports` (member sort only), `prefer-template`, `object-shorthand`.

## Gotchas

- **`dist/` is Node-ESM loadable.** `tsc` emits extensionless imports, then
  `scripts/fix-esm-imports.mjs` rewrites every relative specifier in `.js`/`.d.ts` to a
  fully-qualified path (`./core` → `./core/index.js`) so native Node ESM and bundlers both resolve
  it. Never ship an unprocessed `tsc` build.
- **Tests aren't typechecked or linted.** `tsconfig*` exclude `**/*.test.ts` / `__tests__/`; eslint
  ignores test files.
- **`format`/`format:check` glob is shallow.** `src/**/*.ts` expands without globstar → only
  `src/*/*.ts`; skips `src/index.ts`, `src/solver/hooks/*`, and tests. Lint still enforces Prettier
  on non-test `src`.
- **Hook tests** (`hooks/__tests__/hooks.test.ts`) use `renderHook` with a `QueryClientProvider`
  built via `createElement` (the file is `.ts`, not `.tsx`) and `MockNetworkClient`.
- `src/solver/index.ts` re-exports solver types; `src/index.ts` does not — import `SolveData`,
  `SolverHints`, etc. from `@sudobility/sudojo_types`.
- `useSudojoRandomBoard` drops `symmetrical` (only `useSudojoBoards` forwards all `BoardQueryParams`);
  `useSudojoUserSubscription`'s key omits `testMode` (test + live share one cache entry);
  `useSudojoInvalidation` has no helpers for communities/strategies/examples.
- `vitest.config.ts`'s `@` → `src` alias is unknown to tsc; don't use it in `src/`.

## Release / publishing (document only — needs explicit request; see git policy)

- Family release is driven from `sudojo_app/scripts/push_all.sh` in dependency order
  (`sudojo_types → sudojo_api → sudojo_client → sudojo_lib → … → apps`): per repo it updates
  `@sudobility/*` deps, validates, `npm version patch --no-git-tag-version`, commits, pushes.
- A push to `main` triggers CI (`unified-cicd.yml`): typecheck → lint → tests → build, then publishes
  to **GitHub Packages** (`publish-target: github`) when the version isn't already published.
  `prepublishOnly` (`clean && build`) runs on any manual publish.
