#!/usr/bin/env bun
/**
 * Example: structured session event log via Hook.dispatch.
 *
 * A single binary handles four event types, writing structured JSONL
 * entries to `/tmp/claude-events-{sessionId}.jsonl`. Every session
 * start, tool use, turn end, and session end gets logged with a
 * timestamp and summary line.
 *
 * The resulting JSONL file can be served by any MCP filesystem server.
 * Point `mcp-filesystem` at `/tmp` and other agents can query what
 * Claude has been doing:
 *
 *     // .mcp.json
 *     {
 *         "mcpServers": {
 *             "session-logs": {
 *                 "type": "stdio",
 *                 "command": "mcp-filesystem",
 *                 "args": ["--root", "/tmp"]
 *             }
 *         }
 *     }
 *
 * Wire all four events in `.claude/settings.json`:
 *
 *     {
 *         "hooks": {
 *             "SessionStart": [{ "hooks": [{ "type": "command", "command": "bun examples/session-event-log.ts" }] }],
 *             "PostToolUse":  [{ "hooks": [{ "type": "command", "command": "bun examples/session-event-log.ts" }] }],
 *             "Stop":         [{ "hooks": [{ "type": "command", "command": "bun examples/session-event-log.ts" }] }],
 *             "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "bun examples/session-event-log.ts" }] }]
 *         }
 *     }
 *
 * @since 0.1.0
 */
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';

import { Hook } from 'effect-claudecode';

const appendEvent = (
	sessionId: string,
	event: string,
	summary: string
): Effect.Effect<void, never, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const logPath = `/tmp/claude-events-${sessionId}.jsonl`;
		const entry = JSON.stringify({
			ts: Date.now(),
			event,
			summary,
			session_id: sessionId
		});
		yield* fs.writeFileString(logPath, entry + '\n', { flag: 'a' });
	}).pipe(Effect.orElseSucceed(() => void 0));

Hook.dispatch({
	SessionStart: Hook.SessionStart.define({
		handler: (input) =>
			appendEvent(
				input.session_id,
				'SessionStart',
				`source=${input.source}`
			).pipe(
				Effect.as(Hook.SessionStart.passthrough()),
				Effect.provide(NodeFileSystem.layer)
			)
	}),

	PostToolUse: Hook.PostToolUse.define({
		handler: (input) =>
			appendEvent(
				input.session_id,
				'PostToolUse',
				`tool=${input.tool_name}`
			).pipe(
				Effect.as(Hook.PostToolUse.passthrough()),
				Effect.provide(NodeFileSystem.layer)
			)
	}),

	Stop: Hook.Stop.define({
		handler: (input) =>
			appendEvent(input.session_id, 'Stop', 'turn ended').pipe(
				Effect.as(Hook.Stop.allowStop()),
				Effect.provide(NodeFileSystem.layer)
			)
	}),

	SessionEnd: Hook.SessionEnd.define({
		handler: (input) =>
			appendEvent(
				input.session_id,
				'SessionEnd',
				`reason=${input.exit_reason}`
			).pipe(
				Effect.as(Hook.SessionEnd.passthrough()),
				Effect.provide(NodeFileSystem.layer)
			)
	})
});
