#!/usr/bin/env bun
/**
 * Example: detect when Claude is stuck in a loop and nudge it out.
 *
 * A stateful PostToolUse hook that persists a typed action log to a
 * JSON file keyed by session ID. On every tool call, it records what
 * happened. When it sees the same action three or more times — the
 * same file read repeatedly, the same failing command — it injects
 * context telling Claude to try a different approach.
 *
 * Because hooks are ephemeral processes (each invocation is a fresh
 * spawn), state is persisted to `/tmp/claude-loop-{sessionId}.json`
 * via the Effect `FileSystem` service.
 *
 * Wire it into `.claude/settings.json`:
 *
 *     {
 *         "hooks": {
 *             "PostToolUse": [
 *                 {
 *                     "hooks": [
 *                         {
 *                             "type": "command",
 *                             "command": "bun examples/loop-detector.ts"
 *                         }
 *                     ]
 *                 }
 *             ]
 *         }
 *     }
 *
 * @since 0.1.0
 */
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Schema from 'effect/Schema';

import { Hook } from 'effect-claudecode';

const REPEAT_THRESHOLD = 3;

const ActionEntry = Schema.Struct({
	tool: Schema.String,
	key: Schema.String
});

const ActionLog = Schema.Struct({
	entries: Schema.Array(ActionEntry)
});

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

			const existing = yield* fs
				.readFileString(statePath)
				.pipe(
					Effect.flatMap((raw) =>
						Schema.decodeUnknownEffect(
							Schema.fromJsonString(ActionLog)
						)(raw)
					),
					Effect.orElseSucceed(
						(): ActionLog => ({ entries: [] })
					)
				);

			const key = actionKey(input);
			const updated: ActionLog = {
				entries: [...existing.entries, { tool: input.tool_name, key }]
			};

			yield* Schema.encodeEffect(Schema.fromJsonString(ActionLog))(
				updated
			).pipe(Effect.flatMap((json) => fs.writeFileString(statePath, json)));

			const repeats = Arr.filter(
				updated.entries,
				(e) => e.tool === input.tool_name && e.key === key
			).length;

			if (repeats >= REPEAT_THRESHOLD) {
				return Hook.PostToolUse.addContext(
					[
						`You have run \`${input.tool_name}\` on \`${key}\` ${repeats} times this session.`,
						'The result has not changed. Step back and consider a different approach',
						'— the fix likely is not in this file, or the command needs different arguments.'
					].join(' ')
				);
			}

			return Hook.PostToolUse.passthrough();
		}).pipe(Effect.provide(NodeFileSystem.layer))
});

Hook.runMain(hook);
