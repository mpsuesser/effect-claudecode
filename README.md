# effect-claudecode

Write [Claude Code](https://code.claude.com) plugins — hooks, skills, subagents, commands, MCP servers — with [Effect v4](https://effect.website).

`effect-claudecode` wraps Claude Code's plugin primitives (stdio hook processes, `.claude/settings.json`, `plugin.json` manifests, frontmatter files, `.mcp.json`) in Effect idioms, so plugin authors get typed input/output schemas for all 26 hook events, Effect-native handlers with injected context, decision constructors per event, and correct stdio/exit-code semantics for free — no more hand-parsing snake_case JSON or gluing `process.exit` calls together.

## Features

- **`Hook.runMain(hook)`** — drop-in runner that reads stdin, decodes the schema, builds a `HookContext`, runs your handler, encodes the output, and exits with the right code
- **26 event schemas** covering the full Claude Code hook surface — permission gates, prompt gates, lifecycle events, subagent events, elicitations, worktree events, and more
- **Decision constructors per event** — `Hook.PreToolUse.deny('reason')`, `Hook.UserPromptSubmit.block('off-topic')`, `Hook.SessionStart.addContext('extra')`
- **`HookContext` service** — `yield* Hook.sessionId`, `yield* Hook.cwd`, `yield* Hook.transcriptPath` inside any handler
- **`Hook.dispatch({...})`** — handle multiple event types from a single binary
- **`Settings.load(cwd)`** — Effect loader that reads and merges enterprise/user/project/local `settings.json` files into one typed `SettingsFile`
- **`Plugin.define({...})` + `Plugin.write(def, dir)`** — declarative plugin builder + materializer that produces a complete plugin directory tree
- **`Frontmatter.parseFile(path)`** — split YAML frontmatter from markdown bodies; decode with `SkillFrontmatter`, `SubagentFrontmatter`, `CommandFrontmatter`, or `OutputStyleFrontmatter`
- **`Mcp.loadJson(path)`** — read `.mcp.json` into a discriminated `stdio` / `http` / `sse` union with typed authorization variants
- **Testing module** — fixtures for every event, end-to-end `runHookWithMockStdin`, `expect*Decision` helpers, mock filesystem/stdio/context layers

## Install

```sh
npm install effect-claudecode effect@4.0.0-beta.43 @effect/platform-node-shared@4.0.0-beta.43
```

```sh
bun add effect-claudecode effect@4.0.0-beta.43 @effect/platform-node-shared@4.0.0-beta.43
```

`effect` and `@effect/platform-node-shared` are peer dependencies. `platform-node-shared` provides the `runMain` + stdio plumbing the hook runner delegates to; it is the shared base that both `@effect/platform-node` and `@effect/platform-bun` build on, so hooks run identically under Node and Bun.

## Quick Start

### A single PreToolUse hook

```ts
import * as Effect from 'effect/Effect';
import { Hook } from 'effect-claudecode';

const hook = Hook.PreToolUse.define({
	handler: (input) => {
		const command =
			typeof input.tool_input['command'] === 'string'
				? input.tool_input['command']
				: '';
		return Effect.succeed(
			/rm\s+-rf\s+\//.test(command)
				? Hook.PreToolUse.deny('destructive command rejected')
				: Hook.PreToolUse.allow()
		);
	}
});

Hook.runMain(hook);
```

Save as `hooks/pre-bash-denylist.ts`, then wire it into `.claude/settings.json`:

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "Bash",
				"hooks": [
					{ "type": "command", "command": "bun hooks/pre-bash-denylist.ts" }
				]
			}
		]
	}
}
```

### A complete plugin via `Plugin.define` + `Plugin.write`

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { Plugin } from 'effect-claudecode';

const plugin = Plugin.define({
	manifest: {
		name: 'effect-guardrails',
		version: '0.1.0',
		author: new Plugin.AuthorInfo({ name: 'Alice' })
	},
	commands: [
		{
			name: 'review',
			content: '---\ndescription: Review staged diffs\n---\n# Review\n'
		}
	],
	skills: [
		{
			name: 'greet',
			content: '---\nname: greet\ndescription: Say hello\n---\n# Greet\n'
		}
	],
	hooksConfig: {
		PreToolUse: [
			{
				matcher: 'Bash',
				hooks: [
					{ type: 'command', command: 'bun ${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash.ts' }
				]
			}
		]
	}
});

Effect.runPromise(
	Plugin.write(plugin, './dist-plugin').pipe(
		Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))
	)
);
```

## Hooks

### `Hook.runMain`

`Hook.runMain(hook)` is the primary entry point. It is called at the top level of a hook script and:

1. Collects all of stdin via `Stdio.stdin`
2. `JSON.parse`s the payload, decodes it against the event's `Input` schema
3. Builds a `HookContext.Service` layer from the decoded envelope
4. Runs the handler with the context layer provided
5. Encodes the returned `Output` value back to JSON and writes it to `Stdio.stdout`
6. Exits the process with the right code (`0` success, `1` non-blocking error, `2` blocking decode error, `130` SIGINT)

The runner internally provides `NodeStdio.layer` from `@effect/platform-node-shared` and installs a custom `Runtime.Teardown` for exit-code mapping. You never call `process.exit` or `JSON.parse` yourself.

### Event definition

Each of the 26 event namespaces exposes the same shape. Using `PreToolUse` as the template:

```ts
import * as Effect from 'effect/Effect';
import { Hook } from 'effect-claudecode';

// Hook.PreToolUse.Input — Schema.Class with envelope + event-specific fields:
//   session_id, transcript_path, cwd, hook_event_name, permission_mode,
//   tool_name, tool_input, tool_use_id
//
// Hook.PreToolUse.Output — universal + event-specific output fields:
//   continue, stopReason, suppressOutput, systemMessage, hookSpecificOutput
//
// Decision constructors:
//   Hook.PreToolUse.allow(reason?)
//   Hook.PreToolUse.deny(reason)
//   Hook.PreToolUse.ask(reason?)
//   Hook.PreToolUse.defer(reason?)
//   Hook.PreToolUse.allowWithUpdatedInput(newInput, reason?)

const hook = Hook.PreToolUse.define({
	handler: (input) =>
		Effect.succeed(
			input.tool_name === 'Bash'
				? Hook.PreToolUse.deny('bash disabled')
				: Hook.PreToolUse.allow()
		)
});

Hook.runMain(hook);
```

`.define(config)` returns a `HookDefinition<Input, Output>` value. The handler can be any Effect whose requirement includes `HookContext.Service` — the runner provides the context, so your handler sees it as `never` at the call site.

### Accessing the envelope via `HookContext`

Inside a handler, access the decoded envelope fields via top-level accessors:

```ts
import * as Effect from 'effect/Effect';
import { Hook } from 'effect-claudecode';

const hook = Hook.SessionStart.define({
	handler: () =>
		Effect.gen(function* () {
			const sessionId = yield* Hook.sessionId;
			const cwd = yield* Hook.cwd;
			const transcriptPath = yield* Hook.transcriptPath;
			const mode = yield* Hook.permissionMode; // string | undefined
			const event = yield* Hook.hookEventName;
			return Hook.SessionStart.addContext(
				`Session ${sessionId} started in ${cwd} (${event}, mode=${mode ?? 'default'})`
			);
		})
});

Hook.runMain(hook);
```

The accessors are `Effect<string, never, HookContext.Service>` — they simply pull a field out of the service. For direct access to the whole interface, yield `HookContext.Service` instead.

### The 26 events

| Event | Decision constructors | Notes |
|---|---|---|
| `PreToolUse` | `allow(reason?)`, `deny(reason)`, `ask(reason?)`, `defer(reason?)`, `allowWithUpdatedInput(input, reason?)` | Permission gate for tool calls |
| `PostToolUse` | `passthrough()`, `block(reason)`, `addContext(text)`, `replaceMcpOutput(output, ctx?)` | Transform tool output |
| `UserPromptSubmit` | `allow()`, `block(reason)`, `addContext(text)`, `renameSession(title)` | Gate / augment user prompts |
| `Notification` | `passthrough()`, `addContext(text)` | Observe notifications |
| `Stop` | `allowStop()`, `block(reason)` | Gate end-of-turn |
| `SubagentStop` | `allowStop()`, `block(reason)` | Gate subagent end-of-turn |
| `SessionStart` | `passthrough()`, `addContext(text)` | Inject boot context |
| `SessionEnd` | `passthrough()` | Side-effect only |
| `PreCompact` | `passthrough()` | Side-effect only |
| `PostCompact` | `passthrough()` | Side-effect only |
| `PermissionRequest` | `allow(options?)`, `deny(message)` | Respond to permission UI |
| `PermissionDenied` | `accept()`, `retry()` | Follow-up on denials |
| `PostToolUseFailure` | `passthrough()`, `addContext(text)` | Augment tool failure telemetry |
| `InstructionsLoaded` | `passthrough()` | Observe instruction reload |
| `StopFailure` | `passthrough()` | Observe failed stops |
| `CwdChanged` | `passthrough()` | Observe working-dir changes |
| `FileChanged` | `passthrough()` | Observe file changes |
| `ConfigChange` | `allow()`, `block(reason)` | Gate config changes |
| `SubagentStart` | `passthrough()`, `addContext(text)` | Inject subagent context |
| `TaskCreated` | `allow()`, `block(reason)` | Gate task creation |
| `TaskCompleted` | `allow()`, `block(reason)` | Gate task completion |
| `TeammateIdle` | `allowIdle()` | Acknowledge idle state |
| `WorktreeCreate` | `created(worktreePath)` | Report created worktree |
| `WorktreeRemove` | `passthrough()` | Observe worktree removal |
| `Elicitation` | `accept(content)`, `decline()`, `cancel()` | Respond to elicitation |
| `ElicitationResult` | `accept(content)`, `decline()`, `cancel()` | Observe elicitation result |

Every namespace also exports `Input` and `Output` schema classes plus a `define(config)` factory. Events with event-specific output fields additionally export a `HookSpecificOutput` schema.

### `Hook.dispatch` — multiple events in one binary

Plugins that handle several events from a single entry point can use `Hook.dispatch` instead of `Hook.runMain`. The runner peeks `hook_event_name` from stdin, routes to the matching definition, and succeeds silently if no handler is registered for the incoming event:

```ts
import * as Effect from 'effect/Effect';
import { Hook } from 'effect-claudecode';

Hook.dispatch({
	PreToolUse: Hook.PreToolUse.define({
		handler: () => Effect.succeed(Hook.PreToolUse.allow())
	}),
	PostToolUse: Hook.PostToolUse.define({
		handler: () => Effect.succeed(Hook.PostToolUse.passthrough())
	}),
	SessionStart: Hook.SessionStart.define({
		handler: () =>
			Effect.succeed(Hook.SessionStart.addContext('session booted'))
	})
});
```

### Matchers

Claude Code matchers are regex strings. `Hook.matchTool` compiles one to a tester function (strings are anchored with `^(?:...)$`), and `Hook.testTool` is a one-shot equivalent:

```ts
import { Hook } from 'effect-claudecode';

const isBash = Hook.matchTool('Bash'); // anchored: matches "Bash" exactly
const isMcp = Hook.matchTool('mcp__.*'); // regex literal also accepted
const isEditOrWrite = Hook.matchTool(/^(Edit|Write)$/);

isBash('Bash'); // true
isBash('Bash(git)'); // false — anchored match
Hook.testTool(/^Read$/, 'Read'); // true
```

These helpers are optional — Claude Code filters hooks by `matcher` before spawning the process, so you rarely need them outside of multi-event `dispatch` scripts.

### Transcript reading

`Hook.readTranscript(path)` is a FileSystem-backed reader for the JSONL conversation transcript. The handler needs a `FileSystem` layer at the call site:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Effect from 'effect/Effect';
import { Hook } from 'effect-claudecode';

const hook = Hook.Stop.define({
	handler: () =>
		Effect.gen(function* () {
			const path = yield* Hook.transcriptPath;
			const events = yield* Hook.readTranscript(path);
			// events is ReadonlyArray<unknown> — decode further as needed
			yield* Effect.logInfo(`transcript has ${events.length} entries`);
			return Hook.Stop.allowStop();
		}).pipe(Effect.provide(NodeFileSystem.layer))
});

Hook.runMain(hook);
```

Fails with `TranscriptReadError { path, cause }` on I/O failure.

## Settings

`Settings.load(cwd)` reads the Claude Code settings files in priority order (enterprise → user → project → local) and returns a merged `SettingsFile`:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { Settings } from 'effect-claudecode';

const program = Effect.gen(function* () {
	const settings = yield* Settings.load(process.cwd());
	console.log(settings.model); // e.g. "sonnet"
	console.log(settings.hooks); // HooksSection
});

Effect.runPromise(
	program.pipe(
		Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))
	)
);
```

The loader requires `FileSystem`, `Path`, and `Config` services in its environment and fails with one of three tagged errors: `SettingsReadError`, `SettingsParseError`, or `SettingsDecodeError`.

#### Exported schemas

`Settings.SettingsFile`, `Settings.PermissionsConfig`, `Settings.PermissionMode`, `Settings.StatusLineConfig`, `Settings.ApiKeyHelperConfig`, `Settings.WorkingDirectoriesConfig`, `Settings.McpServerEntry`, `Settings.Marketplace`, `Settings.GithubMarketplace`, `Settings.DirectoryMarketplace`, `Settings.HooksSection`, `Settings.HookMatcherGroup`, `Settings.HookEntry`, `Settings.CommandHookEntry`, `Settings.HttpHookEntry`, `Settings.PromptHookEntry`, `Settings.AgentHookEntry`.

## Plugins

### `Plugin.define`

Builds a `PluginDefinition` value from a declarative `PluginConfig`:

```ts
import { Plugin } from 'effect-claudecode';

const plugin = Plugin.define({
	manifest: {
		name: 'effect-guardrails',
		version: '0.1.0',
		description: 'Effect-first guardrail hooks',
		author: new Plugin.AuthorInfo({
			name: 'Alice',
			email: 'a@example.com'
		}),
		keywords: ['effect', 'guardrails']
	},
	commands: [
		{ name: 'review', content: '---\ndescription: Review diffs\n---\n' }
	],
	agents: [
		{ name: 'reviewer', content: '---\nname: reviewer\n---\n' }
	],
	skills: [
		{ name: 'greet', content: '---\nname: greet\ndescription: Say hi\n---\n' }
	],
	outputStyles: [
		{ name: 'terse', content: '---\nname: terse\n---\n' }
	],
	hooksConfig: {
		/* same shape as the "hooks" section of .claude/settings.json */
	},
	mcpConfig: {
		/* same shape as .mcp.json */
	}
});
```

All component arrays are optional. `hooksConfig` and `mcpConfig` are plain records that match the wire formats of `hooks.json` and `.mcp.json` respectively — they're written to disk verbatim.

### `Plugin.write`

Materializes a `PluginDefinition` to disk at `destDir`:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { Plugin } from 'effect-claudecode';

Effect.runPromise(
	Plugin.write(plugin, './dist-plugin').pipe(
		Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer))
	)
);
```

Directory layout produced:

```
./dist-plugin/
├── .claude-plugin/plugin.json
├── commands/<name>.md
├── agents/<name>.md
├── skills/<name>/SKILL.md
├── output-styles/<name>.md
├── hooks/hooks.json             (only if hooksConfig was provided)
└── .mcp.json                    (only if mcpConfig was provided)
```

Requires `FileSystem` and `Path` services. Fails with `PluginWriteError { path, cause }`.

#### Exported schemas

`Plugin.PluginManifest`, `Plugin.AuthorInfo`, `Plugin.UserConfigEntry`, `Plugin.UserConfigRecord`, `Plugin.ChannelSpec`, `Plugin.ComponentPathSpec`, `Plugin.HooksSpec`, `Plugin.ServerConfigSpec`, `Plugin.MarketplaceFile`, `Plugin.MarketplacePluginEntry`, `Plugin.MarketplacePluginSourceSpec`, `Plugin.GithubPluginSource`, `Plugin.DirectoryPluginSource`.

## Frontmatter

Split YAML frontmatter from a markdown body and decode it:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { Frontmatter } from 'effect-claudecode';

const program = Effect.gen(function* () {
	const parsed = yield* Frontmatter.parseFile('./skills/greet/SKILL.md');
	// parsed: { frontmatter: unknown, body: string }

	const skill = yield* Schema.decodeUnknownEffect(Frontmatter.SkillFrontmatter)(
		parsed.frontmatter
	);
	// skill: { name: string, description: string, ... }
	console.log(skill.name);
});

Effect.runPromise(program.pipe(Effect.provide(NodeFileSystem.layer)));
```

If the source has no `---` delimiters, `parseFile` returns `{ frontmatter: undefined, body: source }` (no error). Malformed YAML between valid delimiters fails with `FrontmatterParseError`. I/O failures surface as `FrontmatterReadError`.

For in-memory sources use `Frontmatter.parse(source, path)` — same return type, no FileSystem requirement.

#### Exported schemas

| Schema | Purpose |
|---|---|
| `Frontmatter.SkillFrontmatter` | `SKILL.md` frontmatter — preserves kebab-case keys (`disable-model-invocation`, `user-invocable`, `allowed-tools`, `argument-hint`) |
| `Frontmatter.SubagentFrontmatter` | `agents/*.md` frontmatter — full user + plugin fields, including optional `permissions`, `permissionMode`, and a nested `hooks` subtree |
| `Frontmatter.CommandFrontmatter` | `commands/*.md` frontmatter |
| `Frontmatter.OutputStyleFrontmatter` | `output-styles/*.md` frontmatter |

## MCP

`Mcp.loadJson(path)` reads and decodes a `.mcp.json` file:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Effect from 'effect/Effect';

import { Mcp } from 'effect-claudecode';

const program = Effect.gen(function* () {
	const file = yield* Mcp.loadJson('./.mcp.json');
	// file: McpJsonFile { mcpServers: Record<string, McpServerConfig> }
	for (const [name, server] of Object.entries(file.mcpServers)) {
		console.log(`${name}: ${server.type}`);
	}
});

Effect.runPromise(program.pipe(Effect.provide(NodeFileSystem.layer)));
```

Fails with `McpConfigError { path, cause }` on read, parse, or decode failures.

`Mcp.McpServerConfig` is a discriminated union of three transports:

| Transport | Class | Key fields |
|---|---|---|
| `"stdio"` | `Mcp.StdioMcpServer` | `command`, `args`, `env`, `cwd`, `timeout` |
| `"http"` | `Mcp.HttpMcpServer` | `url`, `headers`, `allowedEnvVars`, `authorization`, `timeout` |
| `"sse"` | `Mcp.SseMcpServer` | `url`, `headers`, `authorization`, `timeout` |

HTTP and SSE servers may carry an `authorization` field of type `Mcp.McpAuthorization`, a union of:

- `Mcp.OAuth2Authorization` — `clientId`, `tokenUrl`, `scopes`
- `Mcp.ApiKeyAuthorization` — `key`, `header`
- `Mcp.BearerAuthorization` — `token`

## Errors

All tagged errors are re-exported at the top level of the barrel so consumers can `catchTag` against them directly:

```ts
import {
	HookInputDecodeError,
	HookHandlerError,
	SettingsReadError,
	PluginWriteError,
	McpConfigError,
	FrontmatterParseError
} from 'effect-claudecode';
```

| Error | Payload | Origin | Exit code |
|---|---|---|---|
| `HookStdinReadError` | `{ cause }` | Runner | 1 |
| `HookInputDecodeError` | `{ cause, phase: 'json' \| 'schema' }` | Runner | **2** (blocking) |
| `HookHandlerError` | `{ cause }` | Runner | 1 |
| `HookOutputEncodeError` | `{ cause }` | Runner | 1 |
| `HookStdoutWriteError` | `{ cause }` | Runner | 1 |
| `TranscriptReadError` | `{ path, cause }` | Transcript | — |
| `SettingsReadError` | `{ path, cause }` | Settings | — |
| `SettingsParseError` | `{ path, cause }` | Settings | — |
| `SettingsDecodeError` | `{ path, cause }` | Settings | — |
| `PluginWriteError` | `{ path, cause }` | Plugin | — |
| `FrontmatterReadError` | `{ path, cause }` | Frontmatter | — |
| `FrontmatterParseError` | `{ path, cause }` | Frontmatter | — |
| `FrontmatterDecodeError` | `{ path, cause }` | Frontmatter | — |
| `McpConfigError` | `{ path, cause }` | MCP | — |

All error classes are declared with `Schema.TaggedErrorClass` and carry an `effect-claudecode/` namespace on their identifier.

### Exit-code semantics

The runner maps the final `Exit<Output, RunnerError>` to a process exit code via a custom `Runtime.Teardown`:

| Exit code | Meaning |
|---|---|
| `0` | Success — handler produced an `Output`, it was encoded and written to stdout |
| `1` | Non-blocking error — stdin read, handler failure, encode error, or stdout write failure |
| `2` | **Blocking** error — schema decode failed (tells Claude Code to halt the pending action) |
| `130` | SIGINT / fiber interruption |

Handler-authored *blocks* (e.g. `Hook.UserPromptSubmit.block('reason')`) travel through the **Output channel**, not the error channel. They exit with `0` and let Claude Code act on the decision encoded in stdout. Exit `2` is reserved for situations where the library itself cannot produce a valid output — i.e. the input couldn't be decoded.

## Testing

`effect-claudecode` ships a full test harness in the `Testing` namespace, designed for `@effect/vitest`:

```ts
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';

import { Hook, Testing } from 'effect-claudecode';

describe('pre-bash-denylist', () => {
	it.effect('denies rm -rf /', () =>
		Effect.gen(function* () {
			const hook = Hook.PreToolUse.define({
				handler: (input) => {
					const command =
						typeof input.tool_input['command'] === 'string'
							? input.tool_input['command']
							: '';
					return Effect.succeed(
						/rm\s+-rf\s+\//.test(command)
							? Hook.PreToolUse.deny('destructive')
							: Hook.PreToolUse.allow()
					);
				}
			});

			const result = yield* Testing.runHookWithMockStdin(
				hook,
				Testing.fixtures.PreToolUse({
					tool_name: 'Bash',
					tool_input: { command: 'rm -rf /' }
				})
			);

			expect(result.exitCode).toBe(0);
			Testing.expectDenyDecision(result.output, 'destructive');
		})
	);
});
```

### `runHookWithMockStdin`

Runs a `HookDefinition` end-to-end through the runner pipeline, injecting stdin from a JSON string and capturing stdout, stderr, exit code, and any error tag:

```ts
const result: {
	output: unknown; // parsed from stdout, or undefined
	stdout: string; // raw
	stderr: string; // raw
	exitCode: number; // 0 | 1 | 2 | 130
	errorTag: string | undefined; // e.g. 'HookInputDecodeError'
} = yield* Testing.runHookWithMockStdin(hook, stdinJson);
```

### `fixtures`

One fixture builder per event, returning a wire-format JSON string with sensible defaults (`session_id: 'test-session'`, `cwd: '/tmp/workspace'`, `transcript_path: '/tmp/transcript.jsonl'`, ...) that you can override field-by-field:

```ts
Testing.fixtures.PreToolUse({ tool_name: 'Bash', tool_input: { command: 'ls' } });
Testing.fixtures.UserPromptSubmit({ prompt: 'Hello, Claude' });
Testing.fixtures.SessionStart({ source: 'resume', model: 'claude-opus-4-6' });
Testing.fixtures.CwdChanged(); // no overrides needed — envelope fields have defaults
```

Fixtures exist for all 26 events. The return type is always `string` — a JSON blob you feed into `runHookWithMockStdin` or decode directly for schema round-trip tests.

### Assertion helpers

Each helper asserts an `Output` against the corresponding decision shape using `expect(...).toMatchObject(...)`:

```ts
Testing.expectAllowDecision(output, 'optional reason');
Testing.expectDenyDecision(output, 'reason');
Testing.expectAskDecision(output, 'optional reason');
Testing.expectBlockDecision(output, 'reason');
Testing.expectAddContext(output, 'optional context text');
```

`expectBlockDecision` matches both the PreToolUse-style `hookSpecificOutput.permissionDecision: 'deny'` and the UserPromptSubmit-style top-level `decision: 'block'`, so one helper covers every event.

### Mock layers

```ts
// Mock filesystem for settings / transcript / frontmatter tests
Effect.provide(
	Testing.makeMockFileSystem({
		'/a.txt': 'A',
		'/b.txt': 'B'
	})
);

// Or pass a ReadonlyMap
Effect.provide(Testing.makeMockFileSystem(new Map([['/x', 'X']])));

// Mock stdio for direct runner-level testing
Effect.provide(
	Testing.makeMockStdioLayer({
		stdinJson: '...',
		stdoutBuffer: [],
		stderrBuffer: []
	})
);
```

`makeMockFileSystem` accepts either a plain record or a `ReadonlyMap<string, string>`. Reads return the mapped content, `exists` returns `true`/`false`, and missing paths surface a typed `PlatformError` (`_tag: 'NotFound'`).

### Mock context

Build a `HookContext.Interface` value directly for non-runner tests:

```ts
const context = Testing.makeMockHookContext({
	sessionId: 'my-session',
	cwd: '/workspace',
	hookEventName: 'PreToolUse'
});
```

## Examples

Complete runnable examples live in [`examples/`](./examples):

- [`examples/pre-bash-denylist.ts`](./examples/pre-bash-denylist.ts) — PreToolUse hook that blocks destructive Bash commands via regex deny-list
- [`examples/session-start-inject-env.ts`](./examples/session-start-inject-env.ts) — SessionStart hook that injects session info via `Effect.gen` and the `Hook.sessionId` / `Hook.cwd` accessors
- [`examples/post-tool-log.ts`](./examples/post-tool-log.ts) — PostToolUse hook that branches on typed input and attaches an `addContext` note for oversized tool output
- [`examples/plugin-define-complete.ts`](./examples/plugin-define-complete.ts) — Full `Plugin.define` + `Plugin.write` end-to-end, producing a complete plugin directory under an argv-supplied path

## Development

```sh
bun install
bun run test                                            # vitest run — all tests
bun run typecheck                                       # tsc --noEmit
bunx vitest run test/Hook/Events/PreToolUse.test.ts     # single file
bunx vitest run -t "denies rm -rf"                      # by test name pattern
```

## License

MIT
