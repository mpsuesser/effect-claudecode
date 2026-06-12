/**
 * Settings.json loader.
 *
 * Reads ~/.claude/settings.json, `<cwd>/.claude/settings.json`, and
 * `<cwd>/.claude/settings.local.json`, decodes each against
 * `SettingsFile`, and shallow-merges the results in priority order
 * (user → project → local). Requires `FileSystem`, `Path`, and a
 * `ConfigProvider` (for home-directory lookup) in the environment.
 *
 * @since 0.1.0
 */
import * as Arr from 'effect/Array';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as R from 'effect/Record';
import * as Schema from 'effect/Schema';

import {
	SettingsDecodeError,
	SettingsParseError,
	SettingsReadError
} from '../Errors.ts';
import {
	PermissionsConfig,
	SettingsFile,
	WorkingDirectoriesConfig
} from './Schema.ts';

// ---------------------------------------------------------------------------
// Home directory lookup
// ---------------------------------------------------------------------------

/**
 * Resolve the user's home directory via the Effect Config system.
 *
 * Tries `HOME` first (Unix-like), then `USERPROFILE` (Windows). If
 * neither is set, falls back to `/` — reasonable for tests and
 * sandboxed runs where the loader is expected to find nothing.
 *
 * @internal
 */
const homeDirectory = Config.string('HOME').pipe(
	Config.orElse(() => Config.string('USERPROFILE')),
	Config.withDefault('/')
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface LoadedSource {
	readonly path: string;
	readonly content: Option.Option<string>;
}

const readOptionalFile = (
	path: string
): Effect.Effect<LoadedSource, SettingsReadError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.mapError((cause) => new SettingsReadError({ path, cause }))
		);
		if (!exists) return { path, content: Option.none() };
		const content = yield* fs.readFileString(path).pipe(
			Effect.mapError((cause) => new SettingsReadError({ path, cause }))
		);
		return { path, content: Option.some(content) };
	});

const decodeSettingsFile = (
	path: string,
	content: string
): Effect.Effect<SettingsFile, SettingsParseError | SettingsDecodeError> =>
	Effect.gen(function* () {
		const parsed = yield* Schema.decodeUnknownEffect(
			Schema.UnknownFromJsonString
		)(content).pipe(
			Effect.mapError((cause) => new SettingsParseError({ path, cause }))
		);
		return yield* Schema.decodeUnknownEffect(SettingsFile)(parsed).pipe(
			Effect.mapError(
				(cause) => new SettingsDecodeError({ path, cause })
			)
		);
	});

/** @internal */
const mergeOptions = <A>(
	base: Option.Option<A>,
	override: Option.Option<A>,
	merge: (base: A, override: A) => A
): Option.Option<A> =>
	Option.match(base, {
		onNone: () => override,
		onSome: (baseValue) =>
			Option.match(override, {
				onNone: () => base,
				onSome: (overrideValue) =>
					Option.some(merge(baseValue, overrideValue))
			})
	});

/** @internal */
const mergeOptionalStringArrays = (
	base: ReadonlyArray<string> | undefined,
	override: ReadonlyArray<string> | undefined
): ReadonlyArray<string> | undefined =>
	Option.getOrUndefined(
		mergeOptions(
			Option.fromNullishOr(base),
			Option.fromNullishOr(override),
			(baseValue, overrideValue) =>
				Arr.dedupe(Arr.appendAll(baseValue, overrideValue))
		)
	);

/** @internal */
const mergeOptionalRecords = <A>(
	base: Readonly<Record<string, A>> | undefined,
	override: Readonly<Record<string, A>> | undefined
): Record<string, A> | undefined =>
	Option.getOrUndefined(
		mergeOptions(
			Option.fromNullishOr(base),
			Option.fromNullishOr(override),
			(baseValue, overrideValue) =>
				R.union(
					baseValue,
					overrideValue,
					(_baseValue, overrideRecordValue) => overrideRecordValue
				)
		)
	);

/** @internal */
const mergeWorkingDirectories = (
	base: WorkingDirectoriesConfig | undefined,
	override: WorkingDirectoriesConfig | undefined
): WorkingDirectoriesConfig | undefined =>
	Option.getOrUndefined(
		mergeOptions(
			Option.fromNullishOr(base),
			Option.fromNullishOr(override),
			(baseValue, overrideValue) =>
				new WorkingDirectoriesConfig({
					...baseValue,
					...overrideValue,
					allowed: mergeOptionalStringArrays(
						baseValue.allowed,
						overrideValue.allowed
					),
					denied: mergeOptionalStringArrays(
						baseValue.denied,
						overrideValue.denied
					)
				})
		)
	);

/** @internal */
const mergePermissions = (
	base: PermissionsConfig | undefined,
	override: PermissionsConfig | undefined
): PermissionsConfig | undefined =>
	Option.getOrUndefined(
		mergeOptions(
			Option.fromNullishOr(base),
			Option.fromNullishOr(override),
			(baseValue, overrideValue) =>
				new PermissionsConfig({
					...baseValue,
					...overrideValue,
					allow: mergeOptionalStringArrays(
						baseValue.allow,
						overrideValue.allow
					),
					ask: mergeOptionalStringArrays(
						baseValue.ask,
						overrideValue.ask
					),
					deny: mergeOptionalStringArrays(
						baseValue.deny,
						overrideValue.deny
					),
					additionalDirectories: mergeOptionalStringArrays(
						baseValue.additionalDirectories,
						overrideValue.additionalDirectories
					),
					workingDirectories: mergeWorkingDirectories(
						baseValue.workingDirectories,
						overrideValue.workingDirectories
					)
				})
		)
	);

/** @internal */
const mergeHooks = (
	base: SettingsFile['hooks'],
	override: SettingsFile['hooks']
): SettingsFile['hooks'] =>
	Option.getOrUndefined(
		mergeOptions(
			Option.fromNullishOr(base),
			Option.fromNullishOr(override),
			(baseValue, overrideValue) =>
				R.union(baseValue, overrideValue, (baseGroups, overrideGroups) =>
					Arr.appendAll(baseGroups, overrideGroups)
				)
		)
	);

/**
 * Merge a higher-priority settings file on top of a lower-priority one.
 *
 * Claude Code concatenates array-valued settings across scopes while
 * higher-priority scalar values override lower-priority values. This
 * helper models the known nested settings that need merge behavior and
 * keeps ordinary scalar fields on the usual "later wins" path.
 *
 * @internal
 */
const mergeSettings = (
	base: SettingsFile,
	override: SettingsFile
): SettingsFile =>
	new SettingsFile({
		...base,
		...override,
		hooks: mergeHooks(base.hooks, override.hooks),
		permissions: mergePermissions(base.permissions, override.permissions),
		env: mergeOptionalRecords(base.env, override.env),
		enabledPlugins: mergeOptionalRecords(
			base.enabledPlugins,
			override.enabledPlugins
		),
		extraKnownMarketplaces: mergeOptionalRecords(
			base.extraKnownMarketplaces,
			override.extraKnownMarketplaces
		),
		allowedHttpHookUrls: mergeOptionalStringArrays(
			base.allowedHttpHookUrls,
			override.allowedHttpHookUrls
		),
		httpHookAllowedEnvVars: mergeOptionalStringArrays(
			base.httpHookAllowedEnvVars,
			override.httpHookAllowedEnvVars
		)
	});

const emptySettings = new SettingsFile({});

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Resolve the canonical user settings path (`~/.claude/settings.json`).
 *
 * @category Paths
 * @since 0.1.0
 */
export const userSettingsPath = Effect.gen(function* () {
	const path = yield* Path.Path;
	const home = yield* homeDirectory;
	return path.join(home, '.claude', 'settings.json');
});

/**
 * Resolve the project settings path for a given cwd.
 *
 * @category Paths
 * @since 0.1.0
 */
export const projectSettingsPath = (
	cwd: string
): Effect.Effect<string, never, Path.Path> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return path.join(cwd, '.claude', 'settings.json');
	});

/**
 * Resolve the local (gitignored) settings path for a given cwd.
 *
 * @category Paths
 * @since 0.1.0
 */
export const localSettingsPath = (
	cwd: string
): Effect.Effect<string, never, Path.Path> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return path.join(cwd, '.claude', 'settings.local.json');
	});

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and merge settings.json files from all scopes for the given cwd.
 *
 * Priority order (later sources win on conflicting top-level keys):
 *
 * 1. `~/.claude/settings.json` (user)
 * 2. `<cwd>/.claude/settings.json` (project)
 * 3. `<cwd>/.claude/settings.local.json` (local, usually gitignored)
 *
 * Files that don't exist are silently skipped. Parse or decode errors
 * propagate as `SettingsParseError` / `SettingsDecodeError`.
 *
 * @category Loader
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
 * import * as NodePath from '@effect/platform-node-shared/NodePath'
 * import { Layer } from 'effect'
 * import { Settings } from 'effect-claudecode'
 *
 * const program = Effect.gen(function* () {
 *   const settings = yield* Settings.load(process.cwd())
 *   console.log(settings.model)
 * })
 *
 * program.pipe(
 *   Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
 * )
 * ```
 */
export const load = (
	cwd: string
): Effect.Effect<
	SettingsFile,
	| Config.ConfigError
	| SettingsReadError
	| SettingsParseError
	| SettingsDecodeError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.fn('Settings.load')(function* (cwd: string) {
		yield* Effect.annotateCurrentSpan('settings.cwd', cwd);
		yield* Effect.logDebug('loading Claude Code settings').pipe(
			Effect.annotateLogs({ cwd })
		);
		const userPath = yield* userSettingsPath;
		const projectPath = yield* projectSettingsPath(cwd);
		const localPath = yield* localSettingsPath(cwd);

		const sources = yield* Effect.forEach(
			[userPath, projectPath, localPath],
			readOptionalFile,
			{ concurrency: 1 }
		);

		const decoded = yield* Effect.forEach(
			sources,
			(source) =>
				Option.isNone(source.content)
					? Effect.succeed(Option.none<SettingsFile>())
					: decodeSettingsFile(source.path, source.content.value).pipe(
							Effect.map(Option.some)
						),
			{ concurrency: 1 }
		);

		return Arr.reduce(decoded, emptySettings, (acc, maybe) =>
			Option.isNone(maybe) ? acc : mergeSettings(acc, maybe.value)
		);
	})(cwd);
