# @sudobility/sudojo_client

React Query hooks and API client for the Sudojo Sudoku learning platform.

## Installation

`@sudobility/*` packages are published to GitHub Packages, so consumers need an
`.npmrc` with `@sudobility:registry=https://npm.pkg.github.com` (and a token with
`read:packages` for private installs).

```bash
bun add @sudobility/sudojo_client
# peers
bun add @sudobility/sudojo_types @sudobility/types @sudobility/di @tanstack/react-query react
```

## Usage

Every hook takes an injected `NetworkClient` (from `@sudobility/types`), the API origin, and
usually a Firebase ID token. Pass `""` for public endpoints.

```typescript
import { useSudojoLevels, useSudojoTodayDaily } from '@sudobility/sudojo_client';

function Component({ networkClient, token }) {
  const baseUrl = 'https://api.sudojo.com'; // origin only, no /api/v1
  const { data: daily, isLoading } = useSudojoTodayDaily(networkClient, baseUrl, token);
  const { data: levels } = useSudojoLevels(networkClient, baseUrl, token);
  // data is BaseResponse<T>: levels?.data is Level[]
}
```

```typescript
import { SudojoClient, configureSolutionKey } from '@sudobility/sudojo_client';

await configureSolutionKey(solutionKeyHex); // optional: decrypts "enc:" solution fields
const client = new SudojoClient(networkClient, 'https://api.sudojo.com');
const levels = await client.getLevels(token);
```

## API

- **Hooks**: 78 `useSudojo*` hooks, including `useSudojoInvalidation`, covering levels, techniques, learning, boards, dailies, challenges, examples, users, practices, communities, strategies, gamification, OCR, and health
- **Solver hooks**: `useSolverSolve`, `useSolverValidate`, `useSolverGenerate` (plus imperative `*Mutation` variants)
- **Client**: `SudojoClient` class with 79 typed API methods, and the `createSudojoClient` factory (both `@deprecated` at the root entry; prefer hooks)
- **Errors**: `HintAccessDeniedError` (HTTP 402 from the solver)
- **Query keys**: `queryKeys`, `solverQueryKeys`, `STALE_TIMES`, `SOLVER_STALE_TIMES`

Full endpoint, hook, and cache reference: [docs/API.md](docs/API.md).

## Development

```bash
bun install          # Install dependencies (uses bun.lock)
bun run build        # Build to dist/ (tsc + scripts/fix-esm-imports.mjs)
bun run test:run     # Run Vitest once (`test:watch` watches; there is no `test` script)
bun run typecheck    # TypeScript check (tsc --noEmit)
bun run lint         # ESLint
bun run check-all    # Lint + typecheck + tests
bun run verify       # check-all + build
```

## Related Packages

- `@sudobility/sudojo_types`: type definitions (peer + dev dependency)
- `@sudobility/types`: `NetworkClient`, `BaseResponse` (peer dependency)
- `sudojo_api`: the backend this client calls
- `@sudobility/sudojo_lib`: business-logic hooks built on this client
- `sudojo_app` / `sudojo_app_rn` / `sudojo_extension`: consumer apps

## License

BUSL-1.1
