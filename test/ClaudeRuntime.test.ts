/**
 * Tests for the shared Claude runtime.
 *
 * Verifies that the default runtime prewires the platform services the
 * library needs, and that callers can replace the platform layer in tests
 * while merging in additional services of their own.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import * as ServiceMap from 'effect/ServiceMap';

import * as ClaudeRuntime from '../src/ClaudeRuntime.ts';
import * as Plugin from '../src/Plugin.ts';
import * as Settings from '../src/Settings.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface WriteCapture {
	readonly writes: Map<string, string>;
	readonly dirs: Set<string>;
	readonly layer: Layer.Layer<FileSystem.FileSystem | Path.Path>;
}

const permissionDeniedError = (path: string) =>
	PlatformError.systemError({
		_tag: 'PermissionDenied',
		module: 'FileSystem',
		method: 'writeFileString',
		description: 'Permission denied',
		pathOrDescriptor: path
	});

const makeCapture = (options?: {
	readonly failOn?: (path: string) => boolean;
}): WriteCapture => {
	const writes = new Map<string, string>();
	const dirs = new Set<string>();
	const shouldFail = options?.failOn ?? (() => false);

	const fsLayer = FileSystem.layerNoop({
		writeFileString: (path: string, content: string) =>
			shouldFail(path)
				? Effect.fail(permissionDeniedError(path))
				: Effect.sync(() => {
						writes.set(path, content);
				  }),
		makeDirectory: (path: string) =>
			shouldFail(path)
				? Effect.fail(permissionDeniedError(path))
				: Effect.sync(() => {
					dirs.add(path);
				  })
	});

	return {
		writes,
		dirs,
		layer: Layer.mergeAll(fsLayer, Path.layer)
	};
};

class ExtraService extends ServiceMap.Service<
	ExtraService,
	{
		readonly value: string;
	}
>()('test/ClaudeRuntime/ExtraService') {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeRuntime', () => {
	it('prewires the default platform services', async () => {
		const runtime = ClaudeRuntime.default();

		try {
			const path = await runtime.runPromise(Settings.projectSettingsPath('/repo'));
			expect(path).toBe('/repo/.claude/settings.json');
		} finally {
			await runtime.dispose();
		}
	});

	it('accepts a replacement platform layer and merged extra services', async () => {
		const capture = makeCapture();
		const runtime = ClaudeRuntime.default({
			platformLayer: capture.layer,
			layer: Layer.succeed(
				ExtraService,
				ExtraService.of({ value: 'extra-runtime-service' })
			)
		});

		try {
			const extraValue = await runtime.runPromise(
				Effect.gen(function* () {
					const extra = yield* ExtraService;
					yield* Plugin.write(
						Plugin.define({
							manifest: { name: 'runtime-plugin', version: '0.1.0' }
						}),
						'/dest'
					);
					return extra.value;
				})
			);

			expect(extraValue).toBe('extra-runtime-service');
			expect(capture.dirs.has('/dest/.claude-plugin')).toBe(true);
			expect(capture.writes.get('/dest/.claude-plugin/plugin.json')).toContain(
				'"name": "runtime-plugin"'
			);
		} finally {
			await runtime.dispose();
		}
	});
});
