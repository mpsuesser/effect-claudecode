/**
 * Tests for `Settings.load` — the layered settings.json loader.
 *
 * Uses an in-memory `FileSystem.layerNoop` mock keyed on absolute paths,
 * the posix `Path.layer`, and a `ConfigProvider.layer` pinned to a known
 * `HOME`, so the loader can resolve and merge all three settings scopes
 * deterministically.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Path from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import {
	SettingsDecodeError,
	SettingsParseError
} from '../../src/Errors.ts';
import * as Loader from '../../src/Settings/Loader.ts';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const HOME = '/home/user';
const CWD = '/repo';

const USER_PATH = `${HOME}/.claude/settings.json`;
const PROJECT_PATH = `${CWD}/.claude/settings.json`;
const LOCAL_PATH = `${CWD}/.claude/settings.local.json`;

// ---------------------------------------------------------------------------
// Test layer builders
// ---------------------------------------------------------------------------

const notFoundError = (path: string) =>
	PlatformError.systemError({
		_tag: 'NotFound',
		module: 'FileSystem',
		method: 'readFileString',
		description: 'No such file or directory',
		pathOrDescriptor: path
	});

/**
 * Build a `FileSystem` layer that serves files from the given map. Paths
 * not in the map are reported as non-existent.
 */
const makeFileSystemLayer = (
	files: ReadonlyMap<string, string>
): Layer.Layer<FileSystem.FileSystem> =>
	FileSystem.layerNoop({
		exists: (path: string) => Effect.succeed(files.has(path)),
		readFileString: (path: string) => {
			const content = files.get(path);
			return content === undefined
				? Effect.fail(notFoundError(path))
				: Effect.succeed(content);
		}
	});

/**
 * Compose the full test environment: file system, path service, and a
 * `ConfigProvider` that pins `HOME` to the repo-scoped constant above.
 */
const makeTestLayer = (
	files: ReadonlyMap<string, string>
): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
	Layer.mergeAll(
		makeFileSystemLayer(files),
		Path.layer,
		ConfigProvider.layer(ConfigProvider.fromUnknown({ HOME }))
	);

const fsWith = (
	entries: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, string> => new Map(entries);

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

describe('Settings path resolvers', () => {
	it.effect('userSettingsPath joins HOME with .claude/settings.json', () =>
		Effect.gen(function* () {
			const path = yield* Loader.userSettingsPath;
			expect(path).toBe(USER_PATH);
		}).pipe(Effect.provide(makeTestLayer(fsWith([])))));

	it.effect('projectSettingsPath joins cwd with .claude/settings.json', () =>
		Effect.gen(function* () {
			const path = yield* Loader.projectSettingsPath(CWD);
			expect(path).toBe(PROJECT_PATH);
		}).pipe(Effect.provide(makeTestLayer(fsWith([])))));

	it.effect(
		'localSettingsPath joins cwd with .claude/settings.local.json',
		() =>
			Effect.gen(function* () {
				const path = yield* Loader.localSettingsPath(CWD);
				expect(path).toBe(LOCAL_PATH);
			}).pipe(Effect.provide(makeTestLayer(fsWith([])))));
});

// ---------------------------------------------------------------------------
// Empty and single-scope loads
// ---------------------------------------------------------------------------

describe('Settings.load — single scope', () => {
	it.effect('returns an empty SettingsFile when no files exist', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings.model).toBeUndefined();
			expect(settings.hooks).toBeUndefined();
			expect(settings.permissions).toBeUndefined();
		}).pipe(Effect.provide(makeTestLayer(fsWith([])))));

	it.effect('loads user-scope settings when only the user file exists', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings.model).toBe('claude-opus-4-6');
			expect(settings.includeCoAuthoredBy).toBe(false);
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							USER_PATH,
							JSON.stringify({
								model: 'claude-opus-4-6',
								includeCoAuthoredBy: false
							})
						]
					])
				)
			)
		));

	it.effect(
		'loads project-scope settings when only the project file exists',
		() =>
			Effect.gen(function* () {
				const settings = yield* Loader.load(CWD);
				expect(settings.theme).toBe('dark');
				expect(settings.fastMode).toBe(true);
			}).pipe(
				Effect.provide(
					makeTestLayer(
						fsWith([
							[
								PROJECT_PATH,
								JSON.stringify({
									theme: 'dark',
									fastMode: true
								})
							]
						])
					)
				)
			));

	it.effect('loads local-scope settings when only the local file exists', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings.agent).toBe('planner');
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([[LOCAL_PATH, JSON.stringify({ agent: 'planner' })]])
				)
			)
		));
});

// ---------------------------------------------------------------------------
// Merging — use toMatchObject so missing fields surface as a single failing
// expectation rather than silently-skipped assertions inside an if block.
// ---------------------------------------------------------------------------

describe('Settings.load — merging', () => {
	it.effect(
		'project overrides user on conflicting top-level keys and preserves non-conflicting keys',
		() =>
			Effect.gen(function* () {
				const settings = yield* Loader.load(CWD);
				expect(settings).toMatchObject({
					model: 'claude-sonnet-4-6', // project wins
					theme: 'dark', // user-only key survives
					fastMode: true // project-only key survives
				});
			}).pipe(
				Effect.provide(
					makeTestLayer(
						fsWith([
							[
								USER_PATH,
								JSON.stringify({
									model: 'claude-opus-4-6',
									theme: 'dark'
								})
							],
							[
								PROJECT_PATH,
								JSON.stringify({
									model: 'claude-sonnet-4-6',
									fastMode: true
								})
							]
						])
					)
				)
			));

	it.effect('local beats project beats user', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings.model).toBe('claude-haiku-4-5');
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[USER_PATH, JSON.stringify({ model: 'claude-opus-4-6' })],
						[PROJECT_PATH, JSON.stringify({ model: 'claude-sonnet-4-6' })],
						[LOCAL_PATH, JSON.stringify({ model: 'claude-haiku-4-5' })]
					])
				)
			)
		));

	it.effect(
		'merge is shallow — nested permissions are replaced, not deep-merged',
		() =>
			Effect.gen(function* () {
				const settings = yield* Loader.load(CWD);
				expect(settings.permissions).toEqual({
					mode: 'acceptEdits',
					allow: ['Write(**)']
				});
			}).pipe(
				Effect.provide(
					makeTestLayer(
						fsWith([
							[
								USER_PATH,
								JSON.stringify({
									permissions: {
										mode: 'default',
										deny: ['Bash(rm -rf /)']
									}
								})
							],
							[
								PROJECT_PATH,
								JSON.stringify({
									permissions: {
										mode: 'acceptEdits',
										allow: ['Write(**)']
									}
								})
							]
						])
					)
				)
			));
});

// ---------------------------------------------------------------------------
// Decoding rich structures — use toMatchObject to assert on nested shapes
// without intermediate narrowing helpers.
// ---------------------------------------------------------------------------

describe('Settings.load — complex structures', () => {
	it.effect('decodes a hooks section with command entries', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings).toMatchObject({
				hooks: {
					PreToolUse: [
						{
							matcher: 'Bash',
							hooks: [
								{
									type: 'command',
									command: 'bun hook.ts',
									timeout: 30
								}
							]
						}
					]
				}
			});
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							PROJECT_PATH,
							JSON.stringify({
								hooks: {
									PreToolUse: [
										{
											matcher: 'Bash',
											hooks: [
												{
													type: 'command',
													command: 'bun hook.ts',
													timeout: 30
												}
											]
										}
									]
								}
							})
						]
					])
				)
			)
		));

	it.effect('decodes mcpServers, env, and enabledPlugins records', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings).toMatchObject({
				mcpServers: {
					filesystem: { type: 'stdio', command: 'mcp-fs' }
				},
				env: { API_KEY: 'abc123' },
				enabledPlugins: { 'my-plugin@my-marketplace': true }
			});
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							USER_PATH,
							JSON.stringify({
								mcpServers: {
									filesystem: {
										type: 'stdio',
										command: 'mcp-fs'
									}
								},
								env: { API_KEY: 'abc123' },
								enabledPlugins: {
									'my-plugin@my-marketplace': true
								}
							})
						]
					])
				)
			)
		));

	it.effect('decodes a statusLine configuration', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD);
			expect(settings).toMatchObject({
				statusLine: {
					type: 'command',
					command: 'bun status.ts',
					padding: 2
				}
			});
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							PROJECT_PATH,
							JSON.stringify({
								statusLine: {
									type: 'command',
									command: 'bun status.ts',
									padding: 2
								}
							})
						]
					])
				)
			)
		));
});

// ---------------------------------------------------------------------------
// Error paths — use Effect.flip to convert failures into success values and
// assert against them with toMatchObject, which compares the _tag and the
// `path` field in a single expectation.
// ---------------------------------------------------------------------------

describe('Settings.load — errors', () => {
	it.effect('invalid JSON surfaces as SettingsParseError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(Loader.load(CWD));
			expect(raised).toBeInstanceOf(SettingsParseError);
			expect(raised).toMatchObject({
				_tag: 'SettingsParseError',
				path: USER_PATH
			});
		}).pipe(
			Effect.provide(
				makeTestLayer(fsWith([[USER_PATH, 'this is not json']]))
			)
		));

	it.effect('schema violation surfaces as SettingsDecodeError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(Loader.load(CWD));
			expect(raised).toBeInstanceOf(SettingsDecodeError);
			expect(raised).toMatchObject({
				_tag: 'SettingsDecodeError',
				path: PROJECT_PATH
			});
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							PROJECT_PATH,
							// `model` must be a string, not a number
							JSON.stringify({ model: 123 })
						]
					])
				)
			)
		));

	it.effect('parse error in a later scope aborts the merge', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(Loader.load(CWD));
			expect(raised).toBeInstanceOf(SettingsParseError);
			// The broken file is the local one, so that's the path reported —
			// not the user file that decoded fine.
			expect(raised).toMatchObject({
				_tag: 'SettingsParseError',
				path: LOCAL_PATH
			});
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[USER_PATH, JSON.stringify({ model: 'claude-opus-4-6' })],
						[LOCAL_PATH, '{ not valid']
					])
				)
			)
		));
});
