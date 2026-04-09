/**
 * Transcript reader.
 *
 * Claude Code stores the conversation transcript as a JSON-lines file
 * at the `transcript_path` field of every hook envelope. `readTranscript`
 * reads that file via the Effect `FileSystem` service and parses each
 * line as an unknown JSON value, returning a read-only array.
 *
 * This module requires a platform `FileSystem` layer to be provided by
 * the caller (e.g. `NodeFileSystem.layer` from
 * `@effect/platform-node-shared/NodeFileSystem`).
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Schema from 'effect/Schema';

import { TranscriptReadError } from '../Errors.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const jsonValue = Schema.UnknownFromJsonString;

/**
 * Read a Claude Code transcript file and return each JSONL line as a
 * parsed unknown value.
 *
 * Requires `FileSystem.FileSystem` in the environment.
 *
 * @category Reader
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
 * import { Hook } from 'effect-claudecode'
 *
 * const program = Effect.gen(function* () {
 *   const transcriptPath = yield* Hook.transcriptPath
 *   const events = yield* Hook.readTranscript(transcriptPath)
 *   return events.length
 * })
 *
 * program.pipe(Effect.provide(NodeFileSystem.layer))
 * ```
 */
export const readTranscript = (
	path: string
): Effect.Effect<
	ReadonlyArray<unknown>,
	TranscriptReadError,
	FileSystem.FileSystem
> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const content = yield* fs
			.readFileString(path)
			.pipe(
				Effect.mapError((cause) => new TranscriptReadError({ path, cause }))
			);
		const lines = content
			.split('\n')
			.filter((line) => line.trim().length > 0);
		return yield* Effect.forEach(lines, (line) =>
			Schema.decodeUnknownEffect(jsonValue)(line).pipe(
				Effect.mapError(
					(cause) => new TranscriptReadError({ path, cause })
				)
			)
		);
	});
