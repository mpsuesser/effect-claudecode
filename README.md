# effect-claudecode

Write [Claude Code](https://code.claude.com) plugins — hooks, skills, subagents, commands, MCP servers — with [Effect v4](https://effect.website).

## Install

```sh
npm install effect-claudecode effect@4.0.0-beta.46 @effect/platform-node-shared@4.0.0-beta.46
```

```sh
bun add effect-claudecode effect@4.0.0-beta.46 @effect/platform-node-shared@4.0.0-beta.46
```

## Before / After

A vanilla Claude Code hook that rewrites `npm test` to `bun run test`:

```js
// hooks/rewrite-test.js — vanilla Node.js
let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const command = input.tool_input?.command ?? '';
  const output = command.startsWith('npm test')
    ? { continue: true, hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { command: command.replace('npm test', 'bun run test') },
        permissionDecision: 'allow',
        reason: 'This workspace runs tests through Bun.'
      }}
    : { continue: true };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
});
```

The same hook with effect-claudecode:

```ts
import * as Effect from 'effect/Effect';
import * as Str from 'effect/String';
import { Hook } from 'effect-claudecode';

const hook = Hook.PreToolUse.onTool({
  toolName: 'Bash',
  handler: ({ tool }) =>
    Effect.succeed(
      Str.startsWith('npm test')(tool.command)
        ? Hook.PreToolUse.allowWithUpdatedInput(
            { command: Str.replace('npm test', 'bun run test')(tool.command) },
            'This workspace runs tests through Bun.'
          )
        : Hook.PreToolUse.allow()
    )
});

Hook.runMain(hook);
```

Typed tool payloads, decision constructors, correct exit-code semantics — no stdin plumbing, no manual JSON, no `process.exit`.

## What You Can Build

### Detect when Claude is stuck in a loop

Every Claude Code user has watched Claude read the same file three times in a row or re-run a failing command with the same arguments. This hook detects that and nudges Claude out of the loop.

Because hooks are ephemeral processes (each invocation is a fresh spawn), the action log is persisted to a JSON file keyed by session ID — a pattern that shows off Effect's `FileSystem` service and `Schema` for typed serialization:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Schema from 'effect/Schema';
import { Hook } from 'effect-claudecode';

const REPEAT_THRESHOLD = 3;

const ActionEntry = Schema.Struct({ tool: Schema.String, key: Schema.String });
const ActionLog = Schema.Struct({ entries: Schema.Array(ActionEntry) });
type ActionLog = typeof ActionLog.Type;

const actionKey = (input: Hook.PostToolUse.Input): string => {
  const toolInput = input.tool_input;
  if (input.tool_name === 'Bash') return String(toolInput['command'] ?? 'unknown');
  if (input.tool_name === 'Read' || input.tool_name === 'Edit' || input.tool_name === 'Write')
    return String(toolInput['file_path'] ?? 'unknown');
  return input.tool_name;
};

const hook = Hook.PostToolUse.define({
  handler: (input) =>
    Effect.gen(function* () {
      const sessionId = yield* Hook.sessionId;
      const fs = yield* FileSystem.FileSystem;
      const statePath = `/tmp/claude-loop-${sessionId}.json`;

      const existing = yield* fs.readFileString(statePath).pipe(
        Effect.flatMap((raw) =>
          Schema.decodeUnknownEffect(Schema.fromJsonString(ActionLog))(raw)
        ),
        Effect.orElseSucceed((): ActionLog => ({ entries: [] }))
      );

      const key = actionKey(input);
      const updated: ActionLog = {
        entries: [...existing.entries, { tool: input.tool_name, key }]
      };

      yield* Schema.encodeEffect(Schema.fromJsonString(ActionLog))(updated).pipe(
        Effect.flatMap((json) => fs.writeFileString(statePath, json))
      );

      const repeats = Arr.filter(
        updated.entries,
        (e) => e.tool === input.tool_name && e.key === key
      ).length;

      if (repeats >= REPEAT_THRESHOLD) {
        return Hook.PostToolUse.addContext(
          `You have run \`${input.tool_name}\` on \`${key}\` ${repeats} times this session.` +
          ' The result has not changed. Step back and consider a different approach' +
          ' — the fix likely is not in this file, or the command needs different arguments.'
        );
      }

      return Hook.PostToolUse.passthrough();
    }).pipe(Effect.provide(NodeFileSystem.layer))
});

Hook.runMain(hook);
```

Wire it into `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "bun hooks/loop-detector.ts" }] }
    ]
  }
}
```

### Build a complete plugin in one script

`Plugin.define` assembles a full plugin — commands, agents, skills, output styles, hooks, and MCP config — as a single declarative value. Pipe it through `validate` → `write` → `doctor` and you have an installable plugin directory:

```ts
import * as Effect from 'effect/Effect';
import { ClaudeRuntime, Plugin } from 'effect-claudecode';

const plugin = Plugin.define({
  manifest: {
    name: 'review-toolkit',
    version: '1.0.0',
    description: 'Opinionated code review defaults — commands, agents, and loop detection.',
    author: new Plugin.AuthorInfo({ name: 'Your Team' })
  },
  commands: [
    Plugin.command({
      name: 'review',
      description: 'Review staged changes against project conventions',
      body: '# /review\n\nReview the staged changes. Lead with concrete findings.\n'
    }),
    Plugin.command({
      name: 'summarize',
      description: 'Summarize recent work for a PR description',
      body: '# /summarize\n\nRead the git log and diff. Produce a PR title, summary, and test plan.\n'
    })
  ],
  agents: [
    Plugin.agent({
      name: 'reviewer',
      description: 'Autonomous code review agent',
      body: '# Reviewer\n\nFocus on correctness: logic errors, race conditions, missing tests.\n'
    })
  ],
  skills: [
    Plugin.skill({
      name: 'effect-patterns',
      description: 'Guide Claude toward idiomatic Effect v4 patterns',
      body: '# Effect Patterns\n\nUse TaggedErrorClass for errors, Option for absence, Schema at boundaries.\n'
    })
  ],
  hooksConfig: {
    PostToolUse: [{
      hooks: [{ type: 'command', command: 'bun ${CLAUDE_PLUGIN_ROOT}/hooks/loop-detector.ts' }]
    }]
  },
  mcpConfig: {
    mcpServers: {
      'session-logs': { type: 'stdio', command: 'mcp-filesystem', args: ['--root', '/tmp'] }
    }
  }
});

const runtime = ClaudeRuntime.default();
await runtime.runPromise(
  Plugin.validate(plugin).pipe(
    Effect.flatMap(() => Plugin.write(plugin, 'artifacts/review-toolkit')),
    Effect.flatMap(() => Plugin.doctor('artifacts/review-toolkit')),
    Effect.tap((report) =>
      Effect.logInfo('plugin materialized').pipe(
        Effect.annotateLogs({ errors: report.errors.length, warnings: report.warnings.length })
      )
    )
  )
);
await runtime.dispose();
```

```
artifacts/review-toolkit/
├── .claude-plugin/plugin.json
├── commands/review.md
├── commands/summarize.md
├── agents/reviewer.md
├── skills/effect-patterns/SKILL.md
├── hooks/hooks.json
└── .mcp.json
```

### Stream session activity to external tools

A single binary handles multiple event types via `Hook.dispatch`, writing structured JSONL entries to a session log. Point any MCP filesystem server at the log directory and other agents can query what Claude has been doing in real-time:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import { Hook } from 'effect-claudecode';

const appendEvent = (
  sessionId: string, event: string, summary: string
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entry = JSON.stringify({ ts: Date.now(), event, summary, session_id: sessionId });
    yield* fs.writeFileString(`/tmp/claude-events-${sessionId}.jsonl`, entry + '\n', { flag: 'a' });
  }).pipe(Effect.orElseSucceed(() => void 0));

Hook.dispatch({
  SessionStart: Hook.SessionStart.define({
    handler: (input) =>
      appendEvent(input.session_id, 'SessionStart', `source=${input.source}`).pipe(
        Effect.as(Hook.SessionStart.passthrough()), Effect.provide(NodeFileSystem.layer))
  }),
  PostToolUse: Hook.PostToolUse.define({
    handler: (input) =>
      appendEvent(input.session_id, 'PostToolUse', `tool=${input.tool_name}`).pipe(
        Effect.as(Hook.PostToolUse.passthrough()), Effect.provide(NodeFileSystem.layer))
  }),
  Stop: Hook.Stop.define({
    handler: (input) =>
      appendEvent(input.session_id, 'Stop', 'turn ended').pipe(
        Effect.as(Hook.Stop.allowStop()), Effect.provide(NodeFileSystem.layer))
  }),
  SessionEnd: Hook.SessionEnd.define({
    handler: (input) =>
      appendEvent(input.session_id, 'SessionEnd', `reason=${input.exit_reason}`).pipe(
        Effect.as(Hook.SessionEnd.passthrough()), Effect.provide(NodeFileSystem.layer))
  })
});
```

Wire all four events to the same binary, then add an MCP server that exposes the logs:

```json
{
  "mcpServers": {
    "session-logs": { "type": "stdio", "command": "mcp-filesystem", "args": ["--root", "/tmp"] }
  }
}
```

## Runtime Choices

- **Bun**: write TypeScript hook files and point Claude Code at `bun ./hooks/my-hook.ts`.
- **Node + TypeScript**: keep the same `.ts` hook files, but point Claude Code at `tsx ./hooks/my-hook.ts`.
- **Node + JavaScript**: compile your hook scripts ahead of time and point Claude Code at `node ./hooks/my-hook.js`.

The library itself does not require Bun. Bun is simply the nicest zero-friction path when you want to keep hook scripts as TypeScript files.

For non-hook programs, `ClaudeRuntime.default()` is the minimal preset providing platform services (`FileSystem`, `Path`) and Effect logging. For project-aware tooling, prefer `ClaudeRuntime.project({ cwd })`, which wires in the cached `ClaudeProject` service for settings, plugin lookups, and `.mcp.json` access. Use `ClaudeRuntime.plugin({ cwd, pluginRoot })` when the script should treat a plugin directory as the source of truth.

## Features

### Hook runner & events

- **`Hook.runMain(hook)`** — drop-in runner that reads stdin, decodes the schema, builds a `HookContext`, runs your handler, encodes the output, and exits with the right code
- **26 event schemas** — permission gates, prompt gates, lifecycle events, subagent events, elicitations, worktree events, and more
- **Decision constructors** — `Hook.PreToolUse.deny('reason')`, `Hook.UserPromptSubmit.block('off-topic')`, `Hook.SessionStart.addContext('extra')`
- **`HookContext` service** — `yield* Hook.sessionId`, `yield* Hook.cwd`, `yield* Hook.transcriptPath` inside any handler
- **`Hook.dispatch({...})`** — handle multiple event types from a single binary
- **Typed tool adapters** — `Hook.PreToolUse.onTool(...)` / `Hook.PostToolUse.onTool(...)` for `Bash` and `Read` payloads
- **`HookBus`** — publish decoded hook events to a typed in-process `Stream`

### Plugin builder

- **`Plugin.define({...})` + `Plugin.write(def, dir)`** — declarative plugin builder + materializer that produces a complete plugin directory tree
- **`Plugin.scan(dir)` / `Plugin.load(dir)` / `Plugin.sync(def)`** — inspect, round-trip, and normalize existing plugin directories
- **`Plugin.validate` + `Plugin.doctor`** — pre-write validation and post-write diagnostics

### Project & runtime

- **`ClaudeRuntime.default()` / `.project({ cwd })` / `.plugin({ cwd, pluginRoot })`** — prewired `ManagedRuntime` presets with `FileSystem`, `Path`, and optional cached `ClaudeProject` state
- **`ClaudeProject.layer({ cwd })`** — cached project-scoped access to settings, `.mcp.json`, plugin directories, and named component lookups
- **`Settings.load(cwd)`** — reads and merges user/project/local `settings.json` files into one typed `SettingsFile`

### Parsing & config

- **`Frontmatter.parseSkillFile(path)` and friends** — one-step typed markdown loaders for skills, commands, subagents, and output styles
- **`Mcp.loadJson(path)`** — read `.mcp.json` into a discriminated `stdio` / `http` / `sse` union with typed authorization variants

### Testing

- **Fixtures** for every event with sensible defaults, override field-by-field
- **`runHookWithMockStdin`** — end-to-end hook runner with captured stdout, stderr, exit code
- **`expectAllowDecision` / `expectDenyDecision` / `expectBlockDecision` / `expectAddContext`** — assertion helpers
- **Mock layers** — `makeMockFileSystem`, `makeMockStdioLayer`, `makeMockHookContext`

## Hooks

### `Hook.runMain`

`Hook.runMain(hook)` is the primary entry point. It is called at the top level of a hook script and:

1. Collects all of stdin via `Stdio.stdin`
2. Decodes the stdin JSON payload against the event's `Input` schema
3. Builds a `HookContext.Service` layer from the decoded envelope
4. Runs the handler with the context layer provided
5. Encodes the returned `Output` value back to JSON and writes it to `Stdio.stdout`
6. Exits the process with the right code (`0` success, `1` non-blocking error, `2` blocking decode error, `130` SIGINT)

The runner internally provides `NodeStdio.layer` from `@effect/platform-node-shared` and installs a custom `Runtime.Teardown` for exit-code mapping. You never call `process.exit`, manually decode stdin, or hand-roll stdout/exit handling yourself.

### Typed tool adapters

For common Claude Code tools, `Hook.Tool` and the `onTool(...)` helpers remove the repetitive `tool_input['...']` / `tool_response['...']` narrowing:

```ts
import * as Effect from 'effect/Effect';
import * as Str from 'effect/String';
import { Hook } from 'effect-claudecode';

const hook = Hook.PreToolUse.onTool({
	toolName: 'Bash',
	handler: ({ tool }) =>
		Effect.succeed(
			Str.startsWith('npm test')(tool.command)
				? Hook.PreToolUse.allowWithUpdatedInput(
						{
							command: Str.replace('npm test', 'bun run test')(
								tool.command
							)
						},
						'This workspace runs tests through Bun.'
					)
				: Hook.PreToolUse.allow()
		)
});

Hook.runMain(hook);
```

Currently the built-in typed adapters cover `Bash` and `Read`. The lower-level `Hook.Tool.decodePreToolUse(...)` / `decodePostToolUse(...)` helpers are also exported if you want the typed decoding without the `onTool(...)` wrapper.

### Event definition

Each of the 26 event namespaces exposes the same shape. Using `PreToolUse` as the template:

```ts
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
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
		Effect.gen(function* () {
			return input.tool_name === 'Bash'
				? Hook.PreToolUse.deny('bash disabled')
				: Hook.PreToolUse.allow();
		})
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
			const mode = yield* Hook.permissionMode; // Option.Option<string>
			const event = yield* Hook.hookEventName;
			return Hook.SessionStart.addContext(
				`Session ${sessionId} started in ${cwd} (${event}, mode=${Option.getOrElse(mode, () => 'default')})`
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

`Settings.load(cwd)` reads the Claude Code settings files in priority order (user → project → local) and returns a merged `SettingsFile`:

```ts
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { Settings } from 'effect-claudecode';

const program = Effect.gen(function* () {
	const workspaceDir = process.cwd();
	const settings = yield* Settings.load(workspaceDir);
	yield* Console.log(settings.model); // e.g. "sonnet"
	yield* Console.log(settings.hooks); // HooksSection
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
		name: 'effect-review-kit',
		version: '0.1.0',
		description: 'Project-aware review defaults for Claude Code',
		author: new Plugin.AuthorInfo({
			name: 'Alice',
			email: 'a@example.com'
		}),
		keywords: ['effect', 'review', 'claude-code']
	},
	commands: [
		Plugin.command({
			name: 'review',
			description: 'Review staged changes with project conventions',
			body:
				'# Review\n\nReview the staged changes. Lead with concrete findings, then call out regressions and missing tests.\n'
		})
	],
	agents: [
		Plugin.agent({
			name: 'reviewer',
			description: 'Investigate risky changes before they land',
			body:
				'# Reviewer\n\nFocus on bugs, behavioral regressions, and testing gaps before summarizing anything else.\n'
		})
	],
	skills: [
		Plugin.skill({
			name: 'effect-first',
			description: 'Keep implementations aligned with Effect v4 conventions',
			body:
				'# Effect-First\n\nPrefer typed errors, `Option` for absence, and `Schema` decoding at boundaries.\n'
		})
	],
	outputStyles: [
		Plugin.outputStyle({
			name: 'concise-review',
			description: 'Lead with findings and keep the summary tight',
			body:
				'# Concise Review\n\nStart with issues worth fixing. Keep supporting detail brief and specific.\n'
		})
	],
	hooksConfig: {
		/* same shape as the "hooks" section of .claude/settings.json */
	},
	mcpConfig: {
		/* same shape as .mcp.json */
	}
});
```

All component arrays are optional. Use `Plugin.command(...)`, `Plugin.agent(...)`, `Plugin.skill(...)`, and `Plugin.outputStyle(...)` to author typed markdown components without hand-writing YAML frontmatter strings. `hooksConfig` is typed as `Settings.HooksSection`, and `mcpConfig` is typed as `Mcp.McpJsonFile`.

### `Plugin.write`

Materializes a `PluginDefinition` to disk at `outputDir`:

```ts
import * as Effect from 'effect/Effect';

import { ClaudeRuntime, Plugin } from 'effect-claudecode';

const outputDir = 'artifacts/effect-review-kit';
const runtime = ClaudeRuntime.default();

await runtime.runPromise(
	Plugin.write(plugin, outputDir).pipe(
		Effect.tap(() =>
			Effect.logInfo('plugin written').pipe(
				Effect.annotateLogs({ outputDir })
			)
		)
	)
);

await runtime.dispose();
```

Directory layout produced:

```
outputDir/
├── .claude-plugin/plugin.json
├── commands/<name>.md
├── agents/<name>.md
├── skills/<name>/SKILL.md
├── output-styles/<name>.md
├── hooks/hooks.json             (only if hooksConfig was provided)
└── .mcp.json                    (only if mcpConfig was provided)
```

Requires `FileSystem` and `Path` services. `ClaudeRuntime.default()` is the simplest way to provide them in one-shot build and maintenance scripts. Fails with `PluginWriteError { path, cause }`.

### `Plugin.scan` / `Plugin.load` / `Plugin.sync`

Use the load helpers to introspect and normalize existing plugin directories:

```ts
import * as Effect from 'effect/Effect';

import { ClaudeRuntime, Plugin } from 'effect-claudecode';

const outputDir = 'artifacts/effect-review-kit';
const runtime = ClaudeRuntime.default();

const loaded = await runtime.runPromise(Plugin.load(outputDir));
const synced = Plugin.sync(loaded);

console.log(loaded.manifest.name);
console.log(synced.manifest.commands); // 'commands' when command files exist

await runtime.dispose();
```

- `Plugin.scan(dir)` inspects the canonical component layout and infers a normalized manifest.
- `Plugin.load(dir)` parses the discovered command, agent, skill, and output-style files into a typed `PluginDefinition`.
- `Plugin.sync(def)` rewrites manifest path fields to the canonical layout produced by `Plugin.write`.

#### Exported schemas

`Plugin.PluginManifest`, `Plugin.AuthorInfo`, `Plugin.UserConfigEntry`, `Plugin.UserConfigRecord`, `Plugin.ChannelSpec`, `Plugin.ComponentPathSpec`, `Plugin.HooksSpec`, `Plugin.ServerConfigSpec`, `Plugin.MarketplaceFile`, `Plugin.MarketplacePluginEntry`, `Plugin.MarketplacePluginSourceSpec`, `Plugin.GithubPluginSource`, `Plugin.DirectoryPluginSource`.

## Frontmatter

Split YAML frontmatter from a markdown body and decode it, or render typed frontmatter back into markdown:

```ts
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';

import { ClaudeRuntime, Frontmatter } from 'effect-claudecode';

const runtime = ClaudeRuntime.default();

await runtime.runPromise(
	Effect.gen(function* () {
		const skillPath = 'skills/effect-first/SKILL.md';
		const parsed = yield* Frontmatter.parseSkillFile(skillPath);
		yield* Console.log(parsed.frontmatter.name);
	})
);

await runtime.dispose();
```

```ts
import { Frontmatter } from 'effect-claudecode';

const markdown = Frontmatter.renderSkill(
	{
		name: 'greet',
		description: 'Say hello',
		'allowed-tools': ['Read']
	},
	'# Greet\n\nSay hello to the user.\n'
);
```

If the source has no `---` delimiters, `parseFile` returns `{ frontmatter: undefined, body: source }` (no error). Malformed YAML between valid delimiters fails with `FrontmatterParseError`. I/O failures surface as `FrontmatterReadError`. Typed helpers like `parseSkillFile` additionally surface schema mismatches as `FrontmatterDecodeError`.

For in-memory sources use `Frontmatter.parse(source, path)` — same return type, no FileSystem requirement.

## ClaudeProject

`ClaudeRuntime.project({ cwd })` is the recommended way to consume `ClaudeProject` from local tooling. It wraps the common project-level loaders in explicit caches so repeated hook invocations or diagnostics can reuse parsed state until you decide to invalidate it:

```ts
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

import { ClaudeProject, ClaudeRuntime } from 'effect-claudecode';

const workspaceDir = process.cwd();
const runtime = ClaudeRuntime.project({ cwd: workspaceDir });

const summary = await runtime.runPromise(
	Effect.gen(function* () {
		const project = yield* ClaudeProject.project;
		const settings = yield* project.settings;
		const reviewSkill = yield* project.skill('review');
		return {
			model: settings.model,
			hasReviewSkill: Option.isSome(reviewSkill)
		};
	})
);

await runtime.dispose();
```

The service exposes cached `settings`, optional cached `mcp`, cached `plugin`, name-based component lookups (`skill`, `command`, `agent`, `outputStyle`), and explicit invalidators under `project.invalidate.*`.

For advanced cases, manual layer composition is still available:

```ts
import { ClaudeProject, ClaudeRuntime } from 'effect-claudecode';

const workspaceDir = process.cwd();
const runtime = ClaudeRuntime.default({
	layer: ClaudeProject.ClaudeProject.layer({ cwd: workspaceDir })
});
```

## HookBus

`HookBus` is a typed in-process event bus over decoded hook inputs. It is useful for multi-event binaries, reactive local tooling, or any long-lived process that wants to build `Stream` pipelines over Claude Code events:

```ts
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';

import { Hook } from 'effect-claudecode';

const program = Effect.scoped(
	Effect.gen(function* () {
		const bus = yield* Hook.HookBus.Service;
		const done = yield* Deferred.make<ReadonlyArray<string>>();

		yield* bus
			.stream('FileChanged')
			.pipe(
				Stream.map((event) => event.file_path),
				Stream.take(2),
				Stream.runCollect,
				Effect.flatMap((paths) => Deferred.succeed(done, Array.from(paths))),
				Effect.forkScoped
			);

		yield* Effect.yieldNow;
		yield* bus.publish(
			new Hook.FileChanged.Input({
				session_id: 'session-1',
				transcript_path: '/workspace/.claude/transcript.jsonl',
				cwd: '/repo',
				hook_event_name: 'FileChanged',
				file_path: '/repo/a.ts',
				change_type: 'modified'
			})
		);
		yield* bus.publish(
			new Hook.FileChanged.Input({
				session_id: 'session-1',
				transcript_path: '/workspace/.claude/transcript.jsonl',
				cwd: '/repo',
				hook_event_name: 'FileChanged',
				file_path: '/repo/b.ts',
				change_type: 'modified'
			})
		);

		return yield* Deferred.await(done);
	}).pipe(Effect.provide(Hook.HookBus.layer))
);
```

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
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';

import { Mcp } from 'effect-claudecode';

const program = Effect.gen(function* () {
	const mcpPath = '.mcp.json';
	const file = yield* Mcp.loadJson(mcpPath);
	// file: McpJsonFile { mcpServers: Record<string, McpServerConfig> }
	yield* Effect.forEach(Object.entries(file.mcpServers), ([name, server]) =>
		Console.log(`${name}: ${server.type}`)
	);
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
import * as P from 'effect/Predicate';

import { Hook, Testing } from 'effect-claudecode';

describe('pre-bash-denylist', () => {
	it.effect('denies rm -rf /', () =>
		Effect.gen(function* () {
			const hook = Hook.PreToolUse.define({
				handler: (input) =>
					Effect.gen(function* () {
						const command = input.tool_input['command'];
						return /rm\s+-rf\s+\//.test(
							P.isString(command) ? command : ''
						)
							? Hook.PreToolUse.deny('destructive')
							: Hook.PreToolUse.allow();
					})
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

One fixture builder per event, returning a wire-format JSON string with sensible defaults (`session_id: 'test-session'`, `cwd: '/workspace'`, `transcript_path: '/workspace/.claude/transcript.jsonl'`, ...) that you can override field-by-field:

```ts
Testing.fixtures.PreToolUse({ tool_name: 'Bash', tool_input: { command: 'ls' } });
Testing.fixtures.UserPromptSubmit({ prompt: 'Hello, Claude' });
Testing.fixtures.SessionStart({ source: 'resume', model: 'claude-opus-4-6' });
Testing.fixtures.CwdChanged(); // no overrides needed — envelope fields have defaults
```

Fixtures exist for all 26 events. The return type is always `string` — a JSON blob you feed into `runHookWithMockStdin` or decode directly for schema round-trip tests.

### Assertion helpers

Each helper asserts an `Output` against the corresponding decision shape and throws when it does not match:

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

- [`examples/loop-detector.ts`](./examples/loop-detector.ts) — Stateful PostToolUse hook that detects when Claude is stuck in a loop and injects context to break the cycle
- [`examples/plugin-factory.ts`](./examples/plugin-factory.ts) — Build a complete plugin (commands, agents, skills, hooks, MCP) from a single `Plugin.define` call
- [`examples/session-event-log.ts`](./examples/session-event-log.ts) — `Hook.dispatch` multi-event handler that writes structured JSONL session logs for MCP consumption
- [`examples/pre-bash-denylist.ts`](./examples/pre-bash-denylist.ts) — PreToolUse hook that blocks destructive Bash commands with `Option.match`, hook context accessors, and structured logs
- [`examples/session-start-inject-env.ts`](./examples/session-start-inject-env.ts) — SessionStart hook that injects session info via `Effect.gen` and the `Hook.sessionId` / `Hook.cwd` accessors
- [`examples/post-read-source-hint.ts`](./examples/post-read-source-hint.ts) — PostToolUse hook that redirects generated-file reads back to the source of truth
- [`examples/plugin-define-complete.ts`](./examples/plugin-define-complete.ts) — Full `Plugin.define` pipeline with validation, write, and post-write diagnostics under a semantic output directory
- [`examples/project-runtime-summary.ts`](./examples/project-runtime-summary.ts) — `ClaudeRuntime.project({ cwd })` with concurrent cached lookups, `Option.match`, and structured logs

## Development

```sh
bun install
bun run check                                           # test + typecheck + build + npm pack --dry-run
bun run build                                           # emit dist/ for the npm package
bun run test                                            # vitest run — all tests
bun run typecheck                                       # tsc --noEmit
bun run pack:dry-run                                    # inspect the publish tarball contents
bunx vitest run test/Hook/Events/PreToolUse.test.ts     # single file
bunx vitest run -t "denies rm -rf"                      # by test name pattern
```

## License

MIT
