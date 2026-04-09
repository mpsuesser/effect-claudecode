# AGENTS.md — effect-claudecode

Effect-first library for writing Claude Code hooks, plugins, skills, subagents, commands, and settings in a maximally Effect-native way. Wraps Claude Code's extensibility primitives (stdio hook processes, settings.json, plugin manifests, frontmatter files, .mcp.json) in Effect v4 idioms.

## Build / Lint / Test Commands

```sh
bun run test           # vitest run (all tests)
bun run typecheck      # tsc --noEmit
```

### Running a single test

```sh
bunx vitest run test/Hook/Events/PreToolUse.test.ts     # single file
bunx vitest run -t "denies rm -rf"                        # by test name pattern
bunx vitest run test/Hook/Runner.test.ts -t "schema decode"
```

### Verification before submitting

```sh
bun run test && bun run typecheck
```

## Project Structure

```
src/
  index.ts                  Barrel: re-exports Hook, Settings, Plugin, Frontmatter,
                            Mcp, Testing namespaces + cross-module errors.
  Hook.ts                   Re-export hub for all Hook/* modules.
  Hook/
    Runner.ts               Hook.runMain + Hook.dispatch. Stdio FFI boundary.
    Context.ts              HookContext namespace (ServiceMap.Service + accessors).
    Envelope.ts             Base HookEnvelope schema (session_id, cwd, etc.).
    Matcher.ts              Tool-name regex helpers for Pre/PostToolUse.
    Transcript.ts           FileSystem-backed transcript reader.
    Events/
      index.ts              Builds HookInput/HookOutput tagged unions.
      <EventName>.ts        One file per event — Input, Output, decision
                            helpers, and define(). 27 event files total.
  Settings.ts               Re-export hub for Settings/*.
  Settings/                 SettingsFile schema + Settings.load (user/project/local merge).
  Plugin.ts                 Re-export hub for Plugin/*.
  Plugin/                   plugin.json manifest schema + Plugin.define + Plugin.write.
  Frontmatter.ts            Re-export hub for Frontmatter/*.
  Frontmatter/              YAML-frontmatter parsers for skills, subagents, commands.
  Mcp.ts                    Re-export hub for Mcp/*.
  Mcp/                      .mcp.json schema (stdio/http/sse discriminated).
  Errors.ts                 All Schema.TaggedErrorClass declarations.
  Testing.ts                Test helpers: runHookWithMockStdin, fixtures,
                            expect*Decision assertions.

test/                       One file per source module.
vitest.config.ts            vitest config (plain vitest, no vite-plus in Phase 1).
vitest.setup.ts             @effect/vitest equality testers.
tsconfig.json               Strict TS with @effect/language-service plugin.
```

Single-package project. Bun is the package manager (`bun@1.3.11`). No monorepo tooling. See `/Users/m/.claude/plans/mighty-hatching-stallman.md` for the phased implementation plan.

## Code Style

### Formatting (manual conventions — no auto-formatter wired in Phase 1)

- Tabs for indentation (width 4), print width 80
- Single quotes, semicolons, no trailing commas
- Arrow parens always: `(x) => ...`
- LF line endings
- JSON files: 2-space indentation

### Imports

1. **Type-only imports first**: `import type { ... } from '...'`
2. **External namespace imports**: `import * as Effect from 'effect/Effect'`
3. **Internal imports last**: `import * as Envelope from './Envelope.ts'`

Canonical Effect aliases:

```ts
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import * as ServiceMap from 'effect/ServiceMap';
import * as Stream from 'effect/Stream';
import * as Stdio from 'effect/Stdio';
```

Core combinators from root: `import { Effect, pipe, flow, Match } from 'effect'` — or from the dedicated module: `import * as Effect from 'effect/Effect'`.

**All local imports include `.ts` extension**: `'./Envelope.ts'`, not `'./Envelope'`.

### File & Naming Conventions

- **Source files**: PascalCase (`Runner.ts`, `Context.ts`, `PreToolUse.ts`)
- **Test files**: `<ModuleName>.test.ts` mirroring the source path under `test/`
- **Functions/variables**: camelCase (`runMain`, `fromEnvelope`, `matchTool`)
- **Types/interfaces/classes**: PascalCase (`HookDefinition`, `HookEnvelope`)
- **Service keys**: namespaced strings (`'effect-claudecode/HookContext'`)
- **Namespace-module pattern**: `export namespace HookContext { export class Service ... ; export const layer ... }`

### Module Structure

Every source file follows:

1. Module-level JSDoc with `@since` tag
2. Imports (ordered as above)
3. Sections separated by `// ---...--- // Section Name // ---...---`
4. Exported functions with JSDoc (`@since`, `@example`)
5. Internal helpers marked `/** @internal */`

### Types

- `readonly` on all interface fields and function parameters
- `ReadonlyArray<T>` instead of `T[]`
- No `any`, no `@ts-ignore`, no non-null assertions (`!`)
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are enabled
- Use `| undefined` explicitly for optional properties

### Effect Patterns

- **Schema-first**: every external input (hook stdin, settings.json, plugin.json, frontmatter) is validated through a `Schema.Struct` / `Schema.TaggedStruct` before domain code touches it.
- **Wire format is authoritative**: hook event schemas use snake_case field names (`hook_event_name`, `tool_name`, `tool_input`) because that's what Claude Code sends. Use `Schema.toTaggedUnion('hook_event_name')` at the aggregate level for discrimination; do **not** rename fields to camelCase or `_tag`.
- **Option for absence**: convert nullable values with `Option.fromNullishOr` at boundaries. Chain with `Option.map` / `flatMap` / `match`. Never use `Option.getOrThrow`.
- **Dual API**: public combinators support data-first and data-last via `dual` when appropriate.
- **Effect.gen with function\***: for effectful setup and complex combinators.
- **No `Effect.runSync` at the boundary**: hooks are async by nature. Use `@effect/platform-node-shared/NodeRuntime.runMain` with a custom `Teardown` for exit-code control.
- **Namespace-module services**: `namespace HookContext { class Service extends ServiceMap.Service ... ; const layer = Layer.succeed(Service, ...) }`. Empty class body; construction in `Layer.effect` or `Layer.succeed`.
- **Ref for mutable state** when needed inside handlers.
- **pipe for composition** — especially Option chains and Effect pipelines.
- **Tagged errors**: `Schema.TaggedErrorClass` for every cross-module error. All declared in `src/Errors.ts`.

### Effect Module Usage (not native JS)

- `Arr.*` over `Array.prototype.*` — `Arr.map`, `Arr.filter`, `Arr.reduce`, `Arr.contains`
- `R.*` over `Object.*` — `R.union`, `R.filter`, `R.map`
- `Str.*` over `String.prototype.*` — `Str.trim`, `Str.startsWith`, `Str.split`
- `P.isString`, `P.isObject` over raw `typeof` checks
- `Option` over `null | undefined` in domain code
- No imperative `for` / `for...of` loops in domain code

### Error Handling

- Return `Option.none()` or `Effect.void` for no-op / absent paths
- No `throw` or `try/catch` in domain code (use `Effect.try`, `Effect.tryPromise`)
- Tagged errors via `Schema.TaggedErrorClass` for cross-module failures
- Runner file (`Hook/Runner.ts`) is the one place where Effect failures are mapped to OS exit codes; handler-authored "block" decisions travel through the `Output` channel, not the error channel

### Testing

- Framework: Vitest 4 + `@effect/vitest`
- Import test utilities: `import { describe, expect, it } from '@effect/vitest'`
- Effectful tests: `it.effect('name', () => Effect.gen(function* () { ... }).pipe(Effect.provide(TestLayer)))`
- Pure tests: `test('name', () => { expect(...).toBe(...) })`
- Use `test` for pure tests, `it.effect` for effectful tests (never `it` for pure tests)
- Test module `src/Testing.ts` provides `runHookWithMockStdin`, `makeMockHookContext`, `fixtures.*`, `expect*Decision` helpers
- Section separators between test groups (same `// ---` format as source)

### JSDoc

- Every exported API has JSDoc with `@since 0.x.0`
- Module-level doc block at top of each file with description and `@since`
- `@internal` marks non-public exports
- `@example` with code blocks for key APIs

### Claude Code-Specific Patterns

- **FFI boundary is stdio, not callbacks.** Each hook is a fresh process. The runner reads one JSON blob from `Stdio.stdin`, writes one blob to `Stdio.stdout()`, and signals its decision through the exit code (via `Runtime.Teardown`). No `process.exit` calls anywhere in the library.
- **`HookContext` is a `ServiceMap.Service`** carved from the decoded envelope fields (`session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`). Layer is built per-invocation inside the runner.
- **Exit codes.** `0` = success; `1` = non-blocking error (handler/encode/write failures); `2` = blocking error (schema-decode failures only — prefer `Output` with a `"block"` decision for handler-authored blocks).
- **`Stdio` comes from `effect`**, not a platform package. `Stdio.layerTest({...})` mocks stdin/stdout in tests.
- **`runMain` from `@effect/platform-node-shared/NodeRuntime`** — the same implementation `@effect/platform-bun` re-exports, so hooks run identically under Node and Bun. Peer dep, not hard dep.
- **Event file shape.** Each file under `src/Hook/Events/` exports: `Input` schema (snake_case fields), `Output` schema, `HookSpecificOutput` sub-schema when the event has one, decision helpers (`allow`/`deny`/`block`/`addContext`/`accept`/...), a `Definition` interface, and a `define(config)` factory returning a `Definition`.
- **Matcher semantics.** Claude Code matchers are regex — `Hook.Matcher.matchTool(/^Bash$/)` is a helper for PreToolUse/PostToolUse tool-name matching. Do not re-implement regex predicate logic in individual hooks.
- **Permission mode is optional.** Some events omit `permission_mode` (SessionStart, SessionEnd, PreCompact, CwdChanged, FileChanged, etc.). The envelope schema uses `Schema.optional(...)`; each event re-asserts if it's required.
