#!/usr/bin/env bun
/**
 * Example: inject environment context at session start.
 *
 * Demonstrates accessing the `HookContext` service from inside a
 * handler via the top-level `Hook.sessionId` and `Hook.cwd` accessors
 * and returning an `addContext` decision that surfaces the information
 * to the model as a system message.
 *
 * Wire it into `.claude/settings.json`:
 *
 *     {
 *         "hooks": {
 *             "SessionStart": [
 *                 {
 *                     "hooks": [
 *                         {
 *                             "type": "command",
 *                             "command": "bun examples/session-start-inject-env.ts"
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

const hook = Hook.SessionStart.define({
	handler: () =>
		Effect.gen(function* () {
			const sessionId = yield* Hook.sessionId;
			const cwd = yield* Hook.cwd;
			const context = [
				`Session: ${sessionId}`,
				`Working directory: ${cwd}`,
				`Runtime: ${process.platform} ${process.version}`
			].join('\n');
			return Hook.SessionStart.addContext(context);
		})
});

Hook.runMain(hook);
