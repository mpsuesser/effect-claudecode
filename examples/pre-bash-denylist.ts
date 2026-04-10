#!/usr/bin/env bun
/**
 * Example: block destructive Bash commands via a PreToolUse hook.
 *
 * The handler inspects the typed Bash payload, reads the injected hook
 * context through `Hook.sessionId` / `Hook.cwd`, and uses `Option.match`
 * plus structured Effect logging to explain the decision.
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
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

import { Hook } from 'effect-claudecode';

const DESTRUCTIVE_PATTERNS: ReadonlyArray<RegExp> = [
	/rm\s+-rf\s+\//,
	/sudo\s+rm/,
	/dd\s+.*of=\/dev/,
	/mkfs\./,
	/:\(\)\{.*:\|:&.*\};/ // fork bomb
];

const hook = Hook.PreToolUse.onTool({
	toolName: 'Bash',
	handler: ({ tool }) =>
		Effect.gen(function* () {
			const sessionId = yield* Hook.sessionId;
			const cwd = yield* Hook.cwd;
			const matchedPattern = Arr.findFirst(
				DESTRUCTIVE_PATTERNS,
				(pattern) => pattern.test(tool.command)
			);

			return yield* Option.match(matchedPattern, {
				onNone: () =>
					Effect.logDebug('allowed bash command').pipe(
						Effect.annotateLogs({ sessionId, cwd }),
						Effect.as(Hook.PreToolUse.allow())
					),
				onSome: (pattern) =>
					Effect.logWarning('blocked bash command').pipe(
						Effect.annotateLogs({
							sessionId,
							cwd,
							pattern: pattern.source
						}),
						Effect.as(
							Hook.PreToolUse.deny(
								`blocked: matches ${pattern.source}`
							)
						)
					)
			});
		}).pipe(Effect.annotateLogs({ hook: 'PreToolUse', tool: 'Bash' }))
});

Hook.runMain(hook);
