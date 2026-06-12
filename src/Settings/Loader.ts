/**
 * Settings.json loader.
 *
 * Reads user, project, local, optional CLI, and file-based managed
 * settings, decodes each against `SettingsFile`, and merges them in
 * Claude Code priority order. Requires `FileSystem`, `Path`, and a
 * `ConfigProvider` (for home-directory lookup) in the environment.
 *
 * @since 0.1.0
 */
import * as Arr from 'effect/Array';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Order from 'effect/Order';
import * as Path from 'effect/Path';
import * as R from 'effect/Record';
import * as Schema from 'effect/Schema';
import * as Str from 'effect/String';

import {
	SettingsDecodeError,
	SettingsParseError,
	SettingsReadError
} from '../Errors.ts';
import {
	PermissionsConfig,
	SandboxConfig,
	SandboxFilesystemConfig,
	SandboxNetworkConfig,
	SettingsFile,
	SettingsRaw,
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

export interface LoadOptions {
	/** Path supplied by Claude Code's `--settings` flag. */
	readonly settingsPath?: string;
	/** Override the managed-settings directory, mainly for tests. */
	readonly managedSettingsRoot?: string;
	/** Override all candidate managed-settings directories. */
	readonly managedSettingsRoots?: ReadonlyArray<string>;
}

const defaultManagedSettingsRoots = [
	'/Library/Application Support/ClaudeCode',
	'/etc/claude-code',
	'C:\\Program Files\\ClaudeCode'
] as const;

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

const readDirectoryIfExists = (
	path: string
): Effect.Effect<
	ReadonlyArray<string>,
	SettingsReadError,
	FileSystem.FileSystem
> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.mapError((cause) => new SettingsReadError({ path, cause }))
		);
		if (!exists) return [];
		return yield* fs.readDirectory(path).pipe(
			Effect.mapError((cause) => new SettingsReadError({ path, cause }))
		);
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
		const raw = yield* Schema.decodeUnknownEffect(SettingsRaw)(parsed).pipe(
			Effect.mapError(
				(cause) => new SettingsDecodeError({ path, cause })
			)
		);
		const decoded = yield* Schema.decodeUnknownEffect(SettingsFile)(parsed).pipe(
			Effect.mapError(
				(cause) => new SettingsDecodeError({ path, cause })
			)
		);
		return new SettingsFile({ ...decoded, raw });
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
const mergeSandboxFilesystem = (
	base: Option.Option<SandboxFilesystemConfig>,
	override: Option.Option<SandboxFilesystemConfig>
): Option.Option<SandboxFilesystemConfig> =>
	mergeOptions(
		base,
		override,
		(baseValue, overrideValue) =>
			new SandboxFilesystemConfig({
				...baseValue,
				...overrideValue,
				allowWrite: mergeOptionalStringArrays(
					baseValue.allowWrite,
					overrideValue.allowWrite
				),
				denyWrite: mergeOptionalStringArrays(
					baseValue.denyWrite,
					overrideValue.denyWrite
				),
				denyRead: mergeOptionalStringArrays(
					baseValue.denyRead,
					overrideValue.denyRead
				),
				allowRead: mergeOptionalStringArrays(
					baseValue.allowRead,
					overrideValue.allowRead
				)
			})
	);

/** @internal */
const mergeSandboxNetwork = (
	base: Option.Option<SandboxNetworkConfig>,
	override: Option.Option<SandboxNetworkConfig>
): Option.Option<SandboxNetworkConfig> =>
	mergeOptions(
		base,
		override,
		(baseValue, overrideValue) =>
			new SandboxNetworkConfig({
				...baseValue,
				...overrideValue,
				allowUnixSockets: mergeOptionalStringArrays(
					baseValue.allowUnixSockets,
					overrideValue.allowUnixSockets
				),
				allowMachLookup: mergeOptionalStringArrays(
					baseValue.allowMachLookup,
					overrideValue.allowMachLookup
				),
				allowedDomains: mergeOptionalStringArrays(
					baseValue.allowedDomains,
					overrideValue.allowedDomains
				),
				deniedDomains: mergeOptionalStringArrays(
					baseValue.deniedDomains,
					overrideValue.deniedDomains
				)
			})
	);

/** @internal */
const mergeSandbox = (
	base: Option.Option<SandboxConfig>,
	override: Option.Option<SandboxConfig>
): Option.Option<SandboxConfig> =>
	mergeOptions(
		base,
		override,
		(baseValue, overrideValue) =>
			new SandboxConfig({
				...baseValue,
				...overrideValue,
				excludedCommands: mergeOptionalStringArrays(
					baseValue.excludedCommands,
					overrideValue.excludedCommands
				),
				filesystem: Option.getOrUndefined(
					mergeSandboxFilesystem(
						Option.fromNullishOr(baseValue.filesystem),
						Option.fromNullishOr(overrideValue.filesystem)
					)
				),
				network: Option.getOrUndefined(
					mergeSandboxNetwork(
						Option.fromNullishOr(baseValue.network),
						Option.fromNullishOr(overrideValue.network)
					)
				)
			})
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
		raw: mergeOptionalRecords(base.raw, override.raw),
		hooks: mergeHooks(base.hooks, override.hooks),
		permissions: mergePermissions(base.permissions, override.permissions),
		sandbox: Option.getOrUndefined(
			mergeSandbox(
				Option.fromNullishOr(base.sandbox),
				Option.fromNullishOr(override.sandbox)
			)
		),
		env: mergeOptionalRecords(base.env, override.env),
		enabledPlugins: mergeOptionalRecords(
			base.enabledPlugins,
			override.enabledPlugins
		),
		pluginConfigs: mergeOptionalRecords(
			base.pluginConfigs,
			override.pluginConfigs
		),
		extraKnownMarketplaces: mergeOptionalRecords(
			base.extraKnownMarketplaces,
			override.extraKnownMarketplaces
		),
		availableModels: mergeOptionalStringArrays(
			base.availableModels,
			override.availableModels
		),
		allowedHttpHookUrls: mergeOptionalStringArrays(
			base.allowedHttpHookUrls,
			override.allowedHttpHookUrls
		),
		httpHookAllowedEnvVars: mergeOptionalStringArrays(
			base.httpHookAllowedEnvVars,
			override.httpHookAllowedEnvVars
		),
		spinnerTipsOverride: mergeOptionalStringArrays(
			base.spinnerTipsOverride,
			override.spinnerTipsOverride
		),
		spinnerVerbs: mergeOptionalStringArrays(
			base.spinnerVerbs,
			override.spinnerVerbs
		),
		companyAnnouncements: mergeOptionalStringArrays(
			base.companyAnnouncements,
			override.companyAnnouncements
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

const managedRoots = (
	options: Option.Option<LoadOptions>
): ReadonlyArray<string> =>
	Option.match(options, {
		onNone: () => defaultManagedSettingsRoots,
		onSome: (value) =>
			Option.match(Option.fromNullishOr(value.managedSettingsRoots), {
				onNone: () =>
					Option.match(Option.fromNullishOr(value.managedSettingsRoot), {
						onNone: () => defaultManagedSettingsRoots,
						onSome: (root) => [root]
					}),
				onSome: (roots) => roots
			})
	});

const managedSettingsSourcePaths = (
	options: Option.Option<LoadOptions>
): Effect.Effect<
	ReadonlyArray<string>,
	SettingsReadError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const perRoot = yield* Effect.forEach(
			managedRoots(options),
			(root) =>
				Effect.gen(function* () {
					const basePath = path.join(root, 'managed-settings.json');
					const dropInDir = path.join(root, 'managed-settings.d');
					const entries = yield* readDirectoryIfExists(dropInDir);
					const dropIns = Arr.map(
						Arr.sort(
							Arr.filter(
								entries,
								(entry) =>
									!Str.startsWith('.')(entry) &&
									Str.endsWith('.json')(entry)
							),
							Order.String
						),
						(entry) => path.join(dropInDir, entry)
					);
					return [basePath, ...dropIns];
				}),
			{ concurrency: 1 }
		);
		return Arr.flatten(perRoot);
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
 * 4. `options.settingsPath` (`--settings` CLI overlay)
 * 5. file-based managed settings (`managed-settings.json`, then sorted
 *    `managed-settings.d/*.json` drop-ins)
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
	cwd: string,
	options?: LoadOptions
): Effect.Effect<
	SettingsFile,
	| Config.ConfigError
	| SettingsReadError
	| SettingsParseError
	| SettingsDecodeError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.fn('Settings.load')(function* (
		cwd: string,
		loadOptions: Option.Option<LoadOptions>
	) {
		yield* Effect.annotateCurrentSpan('settings.cwd', cwd);
		yield* Effect.logDebug('loading Claude Code settings').pipe(
			Effect.annotateLogs({ cwd })
		);
		const userPath = yield* userSettingsPath;
		const projectPath = yield* projectSettingsPath(cwd);
		const localPath = yield* localSettingsPath(cwd);
		const cliPath = Option.flatMap(loadOptions, (value) =>
			Option.fromNullishOr(value.settingsPath)
		);
		const managedPaths = yield* managedSettingsSourcePaths(loadOptions);
		const sourcePaths = [
			userPath,
			projectPath,
			localPath,
			...(Option.isSome(cliPath) ? [cliPath.value] : []),
			...managedPaths
		];

		const sources = yield* Effect.forEach(
			sourcePaths,
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
	})(cwd, Option.fromNullishOr(options));
