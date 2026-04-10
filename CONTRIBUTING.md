# Contributing to effect-claudecode

Thanks for your interest in contributing. This guide covers everything you need to get started.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.0

## Setup

```sh
git clone https://github.com/mpsuesser/effect-claudecode.git
cd effect-claudecode
bun install
```

## Development Workflow

```sh
bun run check       # run tests + typecheck + build + npm pack --dry-run
bun run build       # emit dist/ for npm publishing
bun run test        # run all tests
bun run typecheck   # tsc --noEmit
bun run pack:dry-run
```

Run a single test file or by name:

```sh
bunx vitest run test/Hook/Events/PreToolUse.test.ts
bunx vitest run -t "denies rm -rf"
```

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`.
2. Add or update tests for any changed behavior.
3. Make sure all checks pass:
   ```sh
   bun run check
   ```
4. Open a pull request with a clear description of the change.

## Code Style

See [AGENTS.md](./AGENTS.md) for detailed formatting, import ordering, naming conventions, and Effect patterns used in this project. The key points:

- Tabs, single quotes, semicolons, no trailing commas
- `Option` for absence, not `null`/`undefined`
- Effect modules (`Arr`, `Option`, `P`, `Str`) over native JS equivalents
- JSDoc with `@since` on every export
- `readonly` on all fields and parameters

## Reporting Issues

Use the [GitHub issue templates](https://github.com/mpsuesser/effect-claudecode/issues/new/choose) for bug reports and feature requests.
