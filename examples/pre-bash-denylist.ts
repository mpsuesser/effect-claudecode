#!/usr/bin/env bun
/**
 * Example: block destructive Bash commands via a PreToolUse hook.
 *
 * The handler inspects the `command` field inside `tool_input`. If it
 * matches a known-destructive pattern, the hook emits a `deny` decision;
 * otherwise it allows the tool call through.
 *
 * Wire it into `.claude/settings.json`:
 *
 *     {
 *         "hooks": {
 *             "PreToolUse": [
 *                 {
 *                     "matcher": "Bash",
 *                     "hooks": [
 *                         {
 *                             "type": "command",
 *                             "command": "bun examples/pre-bash-denylist.ts"
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

const DESTRUCTIVE_PATTERNS: ReadonlyArray<RegExp> = [
	/rm\s+-rf\s+\//,
	/sudo\s+rm/,
	/dd\s+.*of=\/dev/,
	/mkfs\./,
	/:\(\)\{.*:\|:&.*\};/ // fork bomb
];

const hook = Hook.PreToolUse.define({
	handler: (input) => {
		const command =
			typeof input.tool_input['command'] === 'string'
				? input.tool_input['command']
				: '';
		const hit = DESTRUCTIVE_PATTERNS.find((pattern) =>
			pattern.test(command)
		);
		return Effect.succeed(
			hit !== undefined
				? Hook.PreToolUse.deny(`blocked: matches ${hit.source}`)
				: Hook.PreToolUse.allow()
		);
	}
});

Hook.runMain(hook);
