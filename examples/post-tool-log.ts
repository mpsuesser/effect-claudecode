#!/usr/bin/env bun
/**
 * Example: attach a helpful context note when Bash tool output is large.
 *
 * Demonstrates branching on a typed `PostToolUse.Input` and returning
 * either a `passthrough` decision (do nothing) or an `addContext`
 * decision (append a system message to the next turn). No filesystem
 * or external services involved.
 *
 * Wire it into `.claude/settings.json`:
 *
 *     {
 *         "hooks": {
 *             "PostToolUse": [
 *                 {
 *                     "matcher": "Bash",
 *                     "hooks": [
 *                         {
 *                             "type": "command",
 *                             "command": "bun examples/post-tool-log.ts"
 *                         }
 *                     ]
 *                 }
 *             ]
 *         }
 *     }
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';

import { Hook } from 'effect-claudecode';

const LARGE_OUTPUT_THRESHOLD = 10_000;

const hook = Hook.PostToolUse.onTool({
	toolName: 'Bash',
	handler: ({ response }) => {
		const output = response.output ?? '';
		return Effect.succeed(
			output.length > LARGE_OUTPUT_THRESHOLD
				? Hook.PostToolUse.addContext(
						`Note: the Bash tool returned ${output.length} chars of output — consider narrowing the next query.`
					)
				: Hook.PostToolUse.passthrough()
		);
	}
});

Hook.runMain(hook);
