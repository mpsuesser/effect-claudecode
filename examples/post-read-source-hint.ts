#!/usr/bin/env bun
/**
 * Example: when Claude reads generated output, point it back to source.
 *
 * Demonstrates `Hook.PostToolUse.onTool({ toolName: 'Read' })` with the
 * typed `Read` payload. When Claude opens a generated file under `dist/`
 * or `build/`, the hook injects a short note that points back to the
 * likely source file under `src/`.
 *
 * Wire it into `.claude/settings.json`:
 *
 *     {
 *         "hooks": {
 *             "PostToolUse": [
 *                 {
 *                     "matcher": "Read",
 *                     "hooks": [
 *                         {
 *                             "type": "command",
 *                             "command": "bun examples/post-read-source-hint.ts"
 *                         }
 *                     ]
 *                 }
 *             ]
 *         }
 *     }
 *
 * @since 0.1.0
 */
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Bool from 'effect/Boolean';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as Str from 'effect/String';

import { Hook } from 'effect-claudecode';

const toSourceFile = (relativePath: string): Option.Option<string> => {
	if (Str.startsWith('dist/')(relativePath) && Str.endsWith('.d.ts')(relativePath)) {
		return Option.some(
			Str.replace('.d.ts', '.ts')(Str.replace('dist/', 'src/')(relativePath))
		);
	}

	if (Str.startsWith('dist/')(relativePath) && Str.endsWith('.js')(relativePath)) {
		return Option.some(
			Str.replace('.js', '.ts')(Str.replace('dist/', 'src/')(relativePath))
		);
	}

	if (Str.startsWith('build/')(relativePath) && Str.endsWith('.js')(relativePath)) {
		return Option.some(
			Str.replace('.js', '.ts')(Str.replace('build/', 'src/')(relativePath))
		);
	}

	return Option.none();
};

const hook = Hook.PostToolUse.onTool({
	toolName: 'Read',
	handler: ({ tool }) =>
		Effect.gen(function* () {
			const cwd = yield* Hook.cwd;
			const path = yield* Path.Path;
			const relativePath = path.normalize(
				Bool.match(path.isAbsolute(tool.file_path), {
					onFalse: () => tool.file_path,
					onTrue: () => path.relative(cwd, tool.file_path)
				})
			);

			return yield* Option.match(toSourceFile(relativePath), {
				onNone: () => Effect.succeed(Hook.PostToolUse.passthrough()),
				onSome: (sourcePath) =>
					Effect.logInfo('redirected generated read to source').pipe(
						Effect.annotateLogs({
							artifact: relativePath,
							source: sourcePath
						}),
						Effect.as(
							Hook.PostToolUse.addContext(
								`This file is generated output. Prefer \`${sourcePath}\` as the source of truth.`
							)
						)
					)
			});
		}).pipe(Effect.provide(NodePath.layer))
});

Hook.runMain(hook);
