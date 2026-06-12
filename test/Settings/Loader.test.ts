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
import * as Arr from 'effect/Array';
import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import * as Schema from 'effect/Schema';
import * as Str from 'effect/String';

import {
	SettingsDecodeError,
	SettingsParseError
} from '../../src/Errors.ts';
import * as Loader from '../../src/Settings/Loader.ts';
import { SettingsRaw } from '../../src/Settings/Schema.ts';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const HOME = '/home/user';
const CWD = '/repo';

const USER_PATH = `${HOME}/.claude/settings.json`;
const PROJECT_PATH = `${CWD}/.claude/settings.json`;
const LOCAL_PATH = `${CWD}/.claude/settings.local.json`;
const CLI_PATH = '/tmp/cli-settings.json';
const MANAGED_ROOT = '/managed/ClaudeCode';
const MANAGED_PATH = `${MANAGED_ROOT}/managed-settings.json`;
const MANAGED_DROP_IN_PATH = `${MANAGED_ROOT}/managed-settings.d/20-security.json`;

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

const directoryEntries = (
	files: ReadonlyMap<string, string>,
	directory: string
): Array<string> => {
	const prefix = `${directory}/`;
	const entries = Arr.map(
		Arr.filter(
			Arr.fromIterable(files.keys()),
			(path) => Str.startsWith(prefix)(path)
		),
		Str.replace(prefix, '')
	);
	return Arr.filter(entries, (entry) => !Str.includes('/')(entry));
};

/**
 * Build a `FileSystem` layer that serves files from the given map. Paths
 * not in the map are reported as non-existent.
 */
const makeFileSystemLayer = (
	files: ReadonlyMap<string, string>
): Layer.Layer<FileSystem.FileSystem> =>
	FileSystem.layerNoop({
		exists: (path: string) =>
			Effect.succeed(
				files.has(path) ||
					Arr.isReadonlyArrayNonEmpty(directoryEntries(files, path))
			),
		readDirectory: (path: string) =>
			Effect.succeed(directoryEntries(files, path)),
		readFileString: (path: string) =>
			Option.match(Option.fromNullishOr(files.get(path)), {
				onNone: () => Effect.fail(notFoundError(path)),
				onSome: Effect.succeed
			})
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

const SettingsJson = Schema.fromJsonString(SettingsRaw);

const settingsJson = Schema.encodeSync(SettingsJson);

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
							settingsJson({
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
				expect(settings.language).toBe('en-US');
				expect(settings.fastMode).toBe(true);
			}).pipe(
				Effect.provide(
					makeTestLayer(
						fsWith([
							[
								PROJECT_PATH,
								settingsJson({
									language: 'en-US',
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
					fsWith([[LOCAL_PATH, settingsJson({ agent: 'planner' })]])
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
					language: 'en-US', // user-only key survives
					fastMode: true // project-only key survives
				});
			}).pipe(
				Effect.provide(
					makeTestLayer(
						fsWith([
							[
								USER_PATH,
								settingsJson({
									model: 'claude-opus-4-6',
									language: 'en-US'
								})
							],
							[
								PROJECT_PATH,
								settingsJson({
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
						[USER_PATH, settingsJson({ model: 'claude-opus-4-6' })],
						[PROJECT_PATH, settingsJson({ model: 'claude-sonnet-4-6' })],
						[LOCAL_PATH, settingsJson({ model: 'claude-haiku-4-5' })]
					])
				)
			)
		));

	it.effect('CLI settings override local settings', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD, { settingsPath: CLI_PATH });
			expect(settings.model).toBe('claude-opus-4-6');
			expect(settings.language).toBe('en-US');
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							LOCAL_PATH,
							settingsJson({
								model: 'claude-haiku-4-5',
								language: 'en-US'
							})
						],
						[CLI_PATH, settingsJson({ model: 'claude-opus-4-6' })]
					])
				)
			)
		));

	it.effect('managed settings override CLI settings and merge drop-ins', () =>
		Effect.gen(function* () {
			const settings = yield* Loader.load(CWD, {
				settingsPath: CLI_PATH,
				managedSettingsRoot: MANAGED_ROOT
			});
			expect(settings.model).toBe('claude-sonnet-4-6');
			expect(settings.allowedHttpHookUrls).toEqual([
				'https://cli.example',
				'https://managed.example',
				'https://drop.example'
			]);
		}).pipe(
			Effect.provide(
				makeTestLayer(
					fsWith([
						[
							CLI_PATH,
							settingsJson({
								model: 'claude-haiku-4-5',
								allowedHttpHookUrls: ['https://cli.example']
							})
						],
						[
							MANAGED_PATH,
							settingsJson({
								model: 'claude-opus-4-6',
								allowedHttpHookUrls: ['https://managed.example']
							})
						],
						[
							MANAGED_DROP_IN_PATH,
							settingsJson({
								model: 'claude-sonnet-4-6',
								allowedHttpHookUrls: ['https://drop.example']
							})
						]
					])
				)
			)
		));

	it.effect(
		'merges nested permissions by concatenating arrays and overriding scalar mode',
		() =>
			Effect.gen(function* () {
				const settings = yield* Loader.load(CWD);
				expect(settings.permissions).toMatchObject({
					defaultMode: 'acceptEdits',
					allow: ['Write(**)'],
					deny: ['Bash(rm -rf /)'],
					additionalDirectories: ['/user-extra', '/project-extra']
				});
			}).pipe(
				Effect.provide(
					makeTestLayer(
						fsWith([
							[
								USER_PATH,
								'{"permissions":{"defaultMode":"default","deny":["Bash(rm -rf /)"],"additionalDirectories":["/user-extra"]}}'
							],
							[
								PROJECT_PATH,
								'{"permissions":{"defaultMode":"acceptEdits","allow":["Write(**)"],"additionalDirectories":["/project-extra"]}}'
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
							settingsJson({
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
							settingsJson({
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
							settingsJson({
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
							settingsJson({ model: 123 })
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
						[USER_PATH, settingsJson({ model: 'claude-opus-4-6' })],
						[LOCAL_PATH, '{ not valid']
					])
				)
			)
		));
});
