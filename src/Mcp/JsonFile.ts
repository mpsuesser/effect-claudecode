/**
 * Schemas and loaders for Claude Code MCP configuration files.
 *
 * Project scope uses `.mcp.json`; user and local scopes live in
 * `~/.claude.json`; enterprise deployments may provide a system
 * `managed-mcp.json`. Loaders read through the Effect `FileSystem`
 * service and decode JSON with Effect Schema.
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

import { McpConfigError } from '../Errors.ts';
import {
	HttpMcpServer,
	McpServerConfig,
	SseMcpServer,
	StdioMcpServer,
	WsMcpServer
} from './Schema.ts';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * The full `.mcp.json` / `managed-mcp.json` file shape — a record of
 * named MCP server entries under `mcpServers`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class McpJsonFile extends Schema.Class<McpJsonFile>('McpJsonFile')({
	mcpServers: Schema.Record(Schema.String, McpServerConfig)
}) {}

export type McpJsonFileInput = ConstructorParameters<typeof McpJsonFile>[0];

/**
 * Per-project entry inside `~/.claude.json`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ClaudeJsonProject extends Schema.Class<ClaudeJsonProject>(
	'ClaudeJsonProject'
)({
	mcpServers: Schema.optional(Schema.Record(Schema.String, McpServerConfig))
}) {}

/**
 * Tolerant schema for the MCP-related portions of `~/.claude.json`.
 *
 * User-scope servers live at top-level `mcpServers`; local-scope
 * servers live under `projects[projectPath].mcpServers`. Other
 * Claude Code keys are intentionally ignored.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ClaudeJsonFile extends Schema.Class<ClaudeJsonFile>(
	'ClaudeJsonFile'
)({
	mcpServers: Schema.optional(Schema.Record(Schema.String, McpServerConfig)),
	projects: Schema.optional(Schema.Record(Schema.String, ClaudeJsonProject))
}) {}

export interface EffectiveMcpLoadOptions {
	/** Override the `~/.claude.json` path, mainly for tests. */
	readonly claudeJsonPath?: string;
	/** Override the project `.mcp.json` path. */
	readonly projectMcpPath?: string;
	/** Plugin-provided MCP configs, lowest precedence in normal loading. */
	readonly pluginMcpConfigs?: ReadonlyArray<McpJsonFile>;
	/** Override the managed MCP directory, mainly for tests. */
	readonly managedMcpRoot?: string;
	/** Override all candidate managed MCP directories. */
	readonly managedMcpRoots?: ReadonlyArray<string>;
}

export interface ManagedMcpLoadOptions {
	/** Override the managed MCP directory, mainly for tests. */
	readonly managedMcpRoot?: string;
	/** Override all candidate managed MCP directories. */
	readonly managedMcpRoots?: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const reservedServerName = 'workspace';

const defaultManagedMcpRoots = [
	'/Library/Application Support/ClaudeCode',
	'/etc/claude-code',
	'C:\\Program Files\\ClaudeCode'
] as const;

/** @internal */
const homeDirectory = Config.string('HOME').pipe(
	Config.orElse(() => Config.string('USERPROFILE')),
	Config.withDefault('/')
);

/**
 * Resolve the canonical `~/.claude.json` path.
 *
 * @category Paths
 * @since 0.1.0
 */
export const userClaudeJsonPath = Effect.gen(function* () {
	const path = yield* Path.Path;
	const home = yield* homeDirectory;
	return path.join(home, '.claude.json');
});

/**
 * Resolve the project `.mcp.json` path for a cwd.
 *
 * @category Paths
 * @since 0.1.0
 */
export const projectMcpJsonPath = (
	cwd: string
): Effect.Effect<string, never, Path.Path> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return path.join(cwd, '.mcp.json');
	});

/** @internal */
const managedRoots = (
	options: Option.Option<ManagedMcpLoadOptions>
): ReadonlyArray<string> =>
	Option.match(options, {
		onNone: () => defaultManagedMcpRoots,
		onSome: (value) =>
			Option.match(Option.fromNullishOr(value.managedMcpRoots), {
				onNone: () =>
					Option.match(Option.fromNullishOr(value.managedMcpRoot), {
						onNone: () => defaultManagedMcpRoots,
						onSome: (root) => [root]
					}),
				onSome: (roots) => roots
			})
	});

/**
 * Resolve candidate system `managed-mcp.json` paths.
 *
 * @category Paths
 * @since 0.1.0
 */
export const managedMcpJsonPaths = (
	options?: ManagedMcpLoadOptions
): Effect.Effect<ReadonlyArray<string>, never, Path.Path> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return Arr.map(
			managedRoots(Option.fromNullishOr(options)),
			(root) => path.join(root, 'managed-mcp.json')
		);
	});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type McpServers = Readonly<Record<string, McpServerConfig>>;

const emptyMcpJsonFile = new McpJsonFile({ mcpServers: {} });

/** @internal */
const parseJson = (
	path: string,
	content: string
): Effect.Effect<unknown, McpConfigError> =>
	Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(content).pipe(
		Effect.mapError((cause) => new McpConfigError({ path, cause }))
	);

/** @internal */
const readFileString = (
	path: string
): Effect.Effect<string, McpConfigError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.readFileString(path).pipe(
			Effect.mapError((cause) => new McpConfigError({ path, cause }))
		);
	});

/** @internal */
const fileExists = (
	path: string
): Effect.Effect<boolean, McpConfigError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.exists(path).pipe(
			Effect.mapError((cause) => new McpConfigError({ path, cause }))
		);
	});

/** @internal */
const decodeMcpJsonFile = (
	path: string,
	parsed: unknown
): Effect.Effect<McpJsonFile, McpConfigError> =>
	Schema.decodeUnknownEffect(McpJsonFile)(parsed).pipe(
		Effect.mapError((cause) => new McpConfigError({ path, cause }))
	);

/** @internal */
const decodeClaudeJsonFile = (
	path: string,
	parsed: unknown
): Effect.Effect<ClaudeJsonFile, McpConfigError> =>
	Schema.decodeUnknownEffect(ClaudeJsonFile)(parsed).pipe(
		Effect.mapError((cause) => new McpConfigError({ path, cause }))
	);

/** @internal */
const withoutReservedServerNames = (
	file: McpJsonFile,
	source: string
): Effect.Effect<McpJsonFile> =>
	R.has(file.mcpServers, reservedServerName)
		? Effect.logWarning(
				'MCP server name `workspace` is reserved; skipping server.'
			).pipe(
				Effect.annotateLogs({ source, server: reservedServerName }),
				Effect.as(
					new McpJsonFile({
						mcpServers: R.remove(file.mcpServers, reservedServerName)
					})
				)
			)
		: Effect.succeed(file);

/** @internal */
const loadOptionalJson = <A>(
	path: string,
	load: (path: string) => Effect.Effect<A, McpConfigError, FileSystem.FileSystem>
): Effect.Effect<Option.Option<A>, McpConfigError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const exists = yield* fileExists(path);
		if (!exists) return Option.none<A>();
		return Option.some(yield* load(path));
	});

/** @internal */
const serverEndpointKey = (
	server: McpServerConfig
): Option.Option<string> => {
	if (server instanceof StdioMcpServer) {
		return Option.some(
			`command:${server.command}\u0000${Arr.join(server.args ?? [], '\u0000')}`
		);
	}
	if (
		server instanceof HttpMcpServer ||
		server instanceof SseMcpServer ||
		server instanceof WsMcpServer
	) {
		return Option.some(`url:${server.url}`);
	}
	return Option.none();
};

/** @internal */
const removeEndpointDuplicates = (
	servers: McpServers,
	server: McpServerConfig
): Record<string, McpServerConfig> =>
	Option.match(serverEndpointKey(server), {
		onNone: () => ({ ...servers }),
		onSome: (endpoint) =>
			R.filter(servers, (candidate) =>
				Option.match(serverEndpointKey(candidate), {
					onNone: () => true,
					onSome: (candidateEndpoint) => candidateEndpoint !== endpoint
				})
			)
	});

/** @internal */
const mergeServerRecords = (
	base: McpServers,
	override: McpServers
): Record<string, McpServerConfig> => {
	const initial: Record<string, McpServerConfig> = { ...base };
	return Arr.reduce(
		R.toEntries(override),
		initial,
		(acc, [name, server]) =>
			R.set(removeEndpointDuplicates(acc, server), name, server)
	);
};

/**
 * Merge MCP config files in increasing precedence order.
 *
 * Later files replace earlier files by server name and also remove any
 * lower-precedence server with the same URL or stdio command/arguments.
 * Fields inside an individual server entry are never merged.
 *
 * @category Helpers
 * @since 0.1.0
 */
export const mergeMcpJsonFiles = (
	files: ReadonlyArray<McpJsonFile>
): McpJsonFile => {
	const initial: Record<string, McpServerConfig> = {};
	return new McpJsonFile({
		mcpServers: Arr.reduce(
			files,
			initial,
			(acc, file) => mergeServerRecords(acc, file.mcpServers)
		)
	});
};

/** @internal */
const mcpFileFromServers = (
	servers: Option.Option<Readonly<Record<string, McpServerConfig>>>,
	source: string
): Effect.Effect<Option.Option<McpJsonFile>> =>
	Option.match(servers, {
		onNone: () => Effect.succeed(Option.none<McpJsonFile>()),
		onSome: (mcpServers) =>
			withoutReservedServerNames(
				new McpJsonFile({ mcpServers }),
				source
			).pipe(Effect.map(Option.some))
	});

/** @internal */
const optionalJsonField = (
	key: string,
	value: unknown
): Readonly<Record<string, unknown>> =>
	Option.match(Option.fromNullishOr(value), {
		onNone: () => ({}),
		onSome: (fieldValue) => ({ [key]: fieldValue })
	});

/** @internal */
const serializeServerForCurrentClaudeCode = (
	server: McpServerConfig
): Readonly<Record<string, unknown>> => {
	if (server instanceof StdioMcpServer) {
		return {
			...optionalJsonField('type', server.type),
			command: server.command,
			...optionalJsonField('args', server.args),
			...optionalJsonField('env', server.env),
			...optionalJsonField('timeout', server.timeout),
			...optionalJsonField('alwaysLoad', server.alwaysLoad)
		};
	}
	if (server instanceof HttpMcpServer) {
		return {
			type: server.type,
			url: server.url,
			...optionalJsonField('headers', server.headers),
			...optionalJsonField('headersHelper', server.headersHelper),
			...optionalJsonField('timeout', server.timeout),
			...optionalJsonField('alwaysLoad', server.alwaysLoad),
			...optionalJsonField('oauth', server.oauth)
		};
	}
	if (server instanceof WsMcpServer) {
		return {
			type: server.type,
			url: server.url,
			...optionalJsonField('headers', server.headers),
			...optionalJsonField('headersHelper', server.headersHelper),
			...optionalJsonField('timeout', server.timeout),
			...optionalJsonField('alwaysLoad', server.alwaysLoad)
		};
	}
	return {
		type: server.type,
		url: server.url,
		...optionalJsonField('headers', server.headers),
		...optionalJsonField('headersHelper', server.headersHelper),
		...optionalJsonField('timeout', server.timeout),
		...optionalJsonField('alwaysLoad', server.alwaysLoad),
		...optionalJsonField('oauth', server.oauth)
	};
};

/**
 * Convert an MCP config into the current Claude Code JSON shape.
 *
 * Deprecated legacy `authorization`, stdio `cwd`, and HTTP
 * `allowedEnvVars` fields are intentionally decode-only and omitted;
 * current Claude Code uses `oauth` for OAuth, plain `headers` /
 * `headersHelper` for bearer or API-key style authentication, and
 * `${VAR}` expansion syntax for environment placeholders.
 *
 * @category Serializers
 * @since 0.1.0
 */
export const toClaudeCodeJson = (
	file: McpJsonFile
): Readonly<{ readonly mcpServers: Readonly<Record<string, unknown>> }> => ({
	mcpServers: R.map(
		R.remove(file.mcpServers, reservedServerName),
		serializeServerForCurrentClaudeCode
	)
});

/** @internal */
const projectClaudeJsonEntry = (
	file: ClaudeJsonFile,
	cwd: string,
	resolvedCwd: string
): Option.Option<ClaudeJsonProject> =>
	Option.flatMap(Option.fromNullishOr(file.projects), (projects) =>
		Option.firstSomeOf([
			Option.fromNullishOr(projects[resolvedCwd]),
			Option.fromNullishOr(projects[cwd])
		])
	);

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/**
 * Read a `.mcp.json` or `managed-mcp.json` file from disk.
 *
 * Missing files are errors for this strict loader; use `loadEffective`
 * or `loadManagedMcp` for optional discovery. A server named
 * `workspace` is skipped with a warning because Claude Code reserves
 * that name internally.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const loadJson = (
	path: string
): Effect.Effect<McpJsonFile, McpConfigError, FileSystem.FileSystem> =>
	Effect.fn('Mcp.loadJson')(function* (path: string) {
		yield* Effect.annotateCurrentSpan('mcp.path', path);
		yield* Effect.logDebug('loading MCP config').pipe(
			Effect.annotateLogs({ path })
		);
		const raw = yield* readFileString(path);
		const parsed = yield* parseJson(path, raw);
		const decoded = yield* decodeMcpJsonFile(path, parsed);
		return yield* withoutReservedServerNames(decoded, path);
	})(path);

/**
 * Read a `~/.claude.json` file and decode the MCP-related sections.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const loadClaudeJson = (
	path: string
): Effect.Effect<ClaudeJsonFile, McpConfigError, FileSystem.FileSystem> =>
	Effect.fn('Mcp.loadClaudeJson')(function* (path: string) {
		yield* Effect.annotateCurrentSpan('mcp.claudeJsonPath', path);
		const raw = yield* readFileString(path);
		const parsed = yield* parseJson(path, raw);
		return yield* decodeClaudeJsonFile(path, parsed);
	})(path);

/**
 * Discover and load the first system `managed-mcp.json` file that exists.
 *
 * Claude Code treats this file as exclusive enterprise control: when it
 * exists, user, project, local, and plugin MCP configs are suppressed.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const loadManagedMcp = (
	options?: ManagedMcpLoadOptions
): Effect.Effect<
	Option.Option<McpJsonFile>,
	McpConfigError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.fn('Mcp.loadManagedMcp')(function* (
		loadOptions: Option.Option<ManagedMcpLoadOptions>
	) {
		const paths = yield* managedMcpJsonPaths(Option.getOrUndefined(loadOptions));
		const loaded = yield* Effect.forEach(
			paths,
			(path) => loadOptionalJson(path, loadJson),
			{ concurrency: 1 }
		);
		return Option.flatten(Arr.findFirst(loaded, Option.isSome));
	})(Option.fromNullishOr(options));

/**
 * Load the effective MCP config for a Claude Code project.
 *
 * Normal precedence is local (`~/.claude.json` project entry) > project
 * (`.mcp.json`) > user (`~/.claude.json` top-level) > plugins. Whole
 * server entries override lower scopes; fields are not merged. If a
 * system `managed-mcp.json` exists, it has exclusive control and the
 * returned config contains only managed servers.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const loadEffective = (
	cwd: string,
	options?: EffectiveMcpLoadOptions
): Effect.Effect<
	McpJsonFile,
	McpConfigError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.fn('Mcp.loadEffective')(function* (
		cwd: string,
		loadOptions: Option.Option<EffectiveMcpLoadOptions>
	) {
		yield* Effect.annotateCurrentSpan('mcp.cwd', cwd);
		const path = yield* Path.Path;
		const resolvedCwd = path.resolve(cwd);
		const managed = yield* loadManagedMcp(
			Option.getOrUndefined(
				Option.map(loadOptions, (value) => ({
					...(value.managedMcpRoot !== undefined
						? { managedMcpRoot: value.managedMcpRoot }
						: {}),
					...(value.managedMcpRoots !== undefined
						? { managedMcpRoots: value.managedMcpRoots }
						: {})
				}))
			)
		);
		if (Option.isSome(managed)) return managed.value;

		const claudePath = yield* Option.match(
			Option.flatMap(loadOptions, (value) =>
				Option.fromNullishOr(value.claudeJsonPath)
			),
			{
				onNone: () =>
					userClaudeJsonPath.pipe(
						Effect.mapError(
							(cause) =>
								new McpConfigError({
									path: '~/.claude.json',
									cause
								})
						)
					),
				onSome: Effect.succeed
			}
		);
		const projectPath = Option.getOrElse(
			Option.flatMap(loadOptions, (value) =>
				Option.fromNullishOr(value.projectMcpPath)
			),
			() => path.join(cwd, '.mcp.json')
		);
		const pluginConfigs = Option.getOrElse(
			Option.flatMap(loadOptions, (value) =>
				Option.fromNullishOr(value.pluginMcpConfigs)
			),
			() => []
		);
		const sanitizedPluginConfigs = yield* Effect.forEach(
			pluginConfigs,
			(config) => withoutReservedServerNames(config, 'plugin MCP config'),
			{ concurrency: 1 }
		);
		const claudeJson = yield* loadOptionalJson(claudePath, loadClaudeJson);
		const userMcp = yield* Option.match(claudeJson, {
			onNone: () => Effect.succeed(Option.none<McpJsonFile>()),
			onSome: (file) =>
				mcpFileFromServers(
					Option.fromNullishOr(file.mcpServers),
					claudePath
				)
		});
		const projectMcp = yield* loadOptionalJson(projectPath, loadJson);
		const localMcp = yield* Option.match(claudeJson, {
			onNone: () => Effect.succeed(Option.none<McpJsonFile>()),
			onSome: (file) =>
				Option.match(projectClaudeJsonEntry(file, cwd, resolvedCwd), {
					onNone: () => Effect.succeed(Option.none<McpJsonFile>()),
					onSome: (project) =>
						mcpFileFromServers(
							Option.fromNullishOr(project.mcpServers),
							`${claudePath}:projects.${resolvedCwd}`
						)
				})
		});

		return mergeMcpJsonFiles([
			...sanitizedPluginConfigs,
			...(Option.isSome(userMcp) ? [userMcp.value] : []),
			...(Option.isSome(projectMcp) ? [projectMcp.value] : []),
			...(Option.isSome(localMcp) ? [localMcp.value] : [])
		]);
	})(cwd, Option.fromNullishOr(options));
