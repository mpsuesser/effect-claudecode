/**
 * Plugin directory scanning and loading.
 *
 * Complements `Plugin.write` with the inverse operations for existing plugin
 * directories: `scan` inspects canonical component locations and infers a
 * normalized manifest, `load` parses the discovered files into a typed
 * `PluginDefinition`, and `sync` preserves explicit layout choices while
 * filling in the default paths that `Plugin.write` uses when a manifest field
 * is omitted.
 *
 * @since 0.1.0
 */
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Order from 'effect/Order';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';

import { PluginLoadError } from '../Errors.ts';
import {
	parseCommandFile,
	parseOutputStyleFile,
	parseSkillFile,
	parseSubagentFile
} from '../Frontmatter.ts';
import { McpJsonFile, loadJson as loadMcpJson } from '../Mcp.ts';
import { HooksSection } from '../Settings/HooksSection.ts';
import {
	isJsonFilePath,
	isMarkdownFilePath,
	isSkillFilePath,
	pathSpecs,
	syncManifest
} from './Layout.ts';
import {
	define,
	type PluginAgentEntry,
	type PluginCommandEntry,
	type PluginDefinition,
	type PluginOutputStyleEntry,
	type PluginSkillEntry
} from './Define.ts';
import { PluginManifest } from './Manifest.ts';

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * Paths discovered during a plugin directory scan.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginScan {
	readonly rootDir: string;
	readonly manifestPath: Option.Option<string>;
	readonly sourceManifest: Option.Option<PluginManifest>;
	readonly commandPaths: ReadonlyArray<string>;
	readonly agentPaths: ReadonlyArray<string>;
	readonly skillPaths: ReadonlyArray<string>;
	readonly outputStylePaths: ReadonlyArray<string>;
	readonly hooksPaths: ReadonlyArray<string>;
	readonly inlineHooksConfig: Option.Option<Schema.Schema.Type<typeof HooksSection>>;
	readonly mcpPaths: ReadonlyArray<string>;
	readonly inlineMcpConfig: Option.Option<McpJsonFile>;
	readonly inferredManifest: PluginManifest;
}

/**
 * A fully loaded plugin directory.
 *
 * @category Models
 * @since 0.1.0
 */
export interface LoadedPlugin extends PluginDefinition {
	readonly rootDir: string;
	readonly sourceManifest: Option.Option<PluginManifest>;
	readonly inferredManifest: PluginManifest;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const manifestFileName = 'plugin.json';
const sortStrings = Order.String;

const listSorted = (paths: ReadonlyArray<string>): ReadonlyArray<string> =>
	Arr.sort(paths, sortStrings);

const readOptionalStringFile = (
	path: string
): Effect.Effect<Option.Option<string>, PluginLoadError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.mapError((cause) => new PluginLoadError({ path, cause }))
		);
		if (!exists) {
			return Option.none();
		}
		const content = yield* fs.readFileString(path).pipe(
			Effect.mapError((cause) => new PluginLoadError({ path, cause }))
		);
		return Option.some(content);
	});

const readOptionalManifest = (
	path: string
): Effect.Effect<
	Option.Option<PluginManifest>,
	PluginLoadError,
	FileSystem.FileSystem
> =>
	readOptionalStringFile(path).pipe(
		Effect.flatMap((maybeContent) =>
			Option.isNone(maybeContent)
				? Effect.succeed(Option.none())
				: Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(
						maybeContent.value
				  ).pipe(
						Effect.flatMap(
							Schema.decodeUnknownEffect(PluginManifest)
						),
						Effect.map(Option.some),
						Effect.mapError(
							(cause) => new PluginLoadError({ path, cause })
						)
				  )
		)
	);

const readOptionalHooks = (
	path: string
): Effect.Effect<
	Option.Option<Schema.Schema.Type<typeof HooksSection>>,
	PluginLoadError,
	FileSystem.FileSystem
> =>
	readOptionalStringFile(path).pipe(
		Effect.flatMap((maybeContent) =>
			Option.isNone(maybeContent)
				? Effect.succeed(Option.none())
				: Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(
						maybeContent.value
				  ).pipe(
						Effect.flatMap(Schema.decodeUnknownEffect(HooksSection)),
						Effect.map(Option.some),
						Effect.mapError(
							(cause) => new PluginLoadError({ path, cause })
						)
				  )
		)
	);

const missingDeclaredPath = (path: string): PluginLoadError =>
	new PluginLoadError({
		path,
		cause: new Error('Declared manifest path does not exist')
	});

const readStringFile = (
	path: string
): Effect.Effect<string, PluginLoadError, FileSystem.FileSystem> =>
	readOptionalStringFile(path).pipe(
		Effect.flatMap((maybeContent) =>
			Option.isNone(maybeContent)
				? Effect.fail(missingDeclaredPath(path))
				: Effect.succeed(maybeContent.value)
		)
	);

const readHooksFile = (
	path: string
): Effect.Effect<Schema.Schema.Type<typeof HooksSection>, PluginLoadError, FileSystem.FileSystem> =>
	readStringFile(path).pipe(
		Effect.flatMap((content) =>
			Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(content).pipe(
				Effect.flatMap(Schema.decodeUnknownEffect(HooksSection)),
				Effect.mapError((cause) => new PluginLoadError({ path, cause }))
			)
		)
	);

const readMcpFile = (
	path: string
): Effect.Effect<McpJsonFile, PluginLoadError, FileSystem.FileSystem> =>
	loadMcpJson(path).pipe(
		Effect.mapError((cause) => new PluginLoadError({ path, cause }))
	);

const readDirectoryIfExists = (
	dirPath: string
): Effect.Effect<ReadonlyArray<string>, PluginLoadError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(dirPath).pipe(
			Effect.mapError((cause) => new PluginLoadError({ path: dirPath, cause }))
		);
		if (!exists) {
			return [];
		}
		const entries = yield* fs.readDirectory(dirPath).pipe(
			Effect.mapError((cause) => new PluginLoadError({ path: dirPath, cause }))
		);
		return listSorted(entries);
	});

const requireExistingPath = (
	path: string
): Effect.Effect<void, PluginLoadError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.mapError((cause) => new PluginLoadError({ path, cause }))
		);
		if (!exists) {
			return yield* Effect.fail(missingDeclaredPath(path));
		}
	});

const markdownFilePaths = (
	dirPath: string,
	entries: ReadonlyArray<string>,
	path: Path.Path
): ReadonlyArray<string> =>
	listSorted(
		entries
			.filter((entry) => entry.endsWith('.md'))
			.map((entry) => path.join(dirPath, entry))
	);

const relativeManifestPaths = (
	spec: string | ReadonlyArray<string> | undefined
): ReadonlyArray<string> => pathSpecs(spec);

const expandMarkdownPathSpec = (options: {
	readonly rootDir: string;
	readonly spec: string | ReadonlyArray<string> | undefined;
	readonly fallbackDir: string;
}): Effect.Effect<ReadonlyArray<string>, PluginLoadError, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const declared = relativeManifestPaths(options.spec);
		if (declared.length === 0) {
			const dirPath = path.join(options.rootDir, options.fallbackDir);
			const entries = yield* readDirectoryIfExists(dirPath);
			return markdownFilePaths(dirPath, entries, path);
		}

		const resolved = yield* Effect.forEach(declared, (relativePath) =>
			Effect.gen(function* () {
				const absolutePath = path.join(options.rootDir, relativePath);
				yield* requireExistingPath(absolutePath);
				if (isMarkdownFilePath(relativePath)) {
					return [absolutePath];
				}
				const entries = yield* readDirectoryIfExists(absolutePath);
				return markdownFilePaths(absolutePath, entries, path);
			})
		);

		return listSorted(resolved.flat());
	});

const expandSkillPathSpec = (options: {
	readonly rootDir: string;
	readonly spec: string | ReadonlyArray<string> | undefined;
	readonly fallbackDir: string;
}): Effect.Effect<ReadonlyArray<string>, PluginLoadError, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const declared = relativeManifestPaths(options.spec);
		if (declared.length === 0) {
			const dirPath = path.join(options.rootDir, options.fallbackDir);
			const entries = yield* readDirectoryIfExists(dirPath);
			const discovered = yield* Effect.forEach(entries, (entry) =>
				Effect.gen(function* () {
					const skillPath = path.join(dirPath, entry, 'SKILL.md');
					const exists = yield* fs.exists(skillPath).pipe(
						Effect.mapError(
							(cause) => new PluginLoadError({ path: skillPath, cause })
						)
					);
					return exists ? Option.some(skillPath) : Option.none<string>();
				})
			);
			return listSorted(Arr.getSomes(discovered));
		}

		const resolved = yield* Effect.forEach(declared, (relativePath) =>
			Effect.gen(function* () {
				const absolutePath = path.join(options.rootDir, relativePath);
				yield* requireExistingPath(absolutePath);
				if (isSkillFilePath(relativePath)) {
					return [absolutePath];
				}
				const entries = yield* readDirectoryIfExists(absolutePath);
				const directSkill = path.join(absolutePath, 'SKILL.md');
				const directExists = yield* fs.exists(directSkill).pipe(
					Effect.mapError(
						(cause) => new PluginLoadError({ path: directSkill, cause })
					)
				);
				const nestedSkills = yield* Effect.forEach(entries, (entry) =>
					Effect.gen(function* () {
						const nestedSkill = path.join(absolutePath, entry, 'SKILL.md');
						const exists = yield* fs.exists(nestedSkill).pipe(
							Effect.mapError(
								(cause) =>
									new PluginLoadError({ path: nestedSkill, cause })
							)
						);
						return exists ? Option.some(nestedSkill) : Option.none<string>();
					})
				);
				return listSorted([
					...(directExists ? [directSkill] : []),
					...Arr.getSomes(nestedSkills)
				]);
			})
		);

		return listSorted(resolved.flat());
	});

const expandJsonPathSpec = (options: {
	readonly rootDir: string;
	readonly spec: string | ReadonlyArray<string> | undefined;
	readonly fallbackPath: string;
}): Effect.Effect<ReadonlyArray<string>, PluginLoadError, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const declared = relativeManifestPaths(options.spec);
		if (declared.length === 0) {
			const fallback = path.join(options.rootDir, options.fallbackPath);
			const maybeContent = yield* readOptionalStringFile(fallback);
			return Option.isSome(maybeContent) ? [fallback] : [];
		}

		return yield* Effect.forEach(declared, (relativePath) =>
			Effect.gen(function* () {
				const absolutePath = path.join(options.rootDir, relativePath);
				yield* requireExistingPath(absolutePath);
				if (!isJsonFilePath(relativePath)) {
					return yield* Effect.fail(
						new PluginLoadError({
							path: absolutePath,
							cause: new Error('Manifest JSON config path must point to a file')
						})
					);
				}
				return absolutePath;
			})
		);
	});

const inlineHooksConfigFromManifest = (
	manifest: PluginManifest | undefined
): Option.Option<Schema.Schema.Type<typeof HooksSection>> => {
	if (manifest === undefined) {
		return Option.none<Schema.Schema.Type<typeof HooksSection>>();
	}
	const hooks = manifest.hooks;
	if (hooks !== undefined && Schema.is(HooksSection)(hooks)) {
		return Option.some(hooks);
	}
	return Option.none<Schema.Schema.Type<typeof HooksSection>>();
};

const inlineMcpSpecFromManifest = (
	manifest: PluginManifest | undefined
): Option.Option<Record<string, unknown>> => {
	if (manifest === undefined) {
		return Option.none<Record<string, unknown>>();
	}
	const mcpServers = manifest.mcpServers;
	if (
		mcpServers === undefined ||
		typeof mcpServers === 'string' ||
		Array.isArray(mcpServers) ||
		typeof mcpServers !== 'object' ||
		mcpServers === null
	) {
		return Option.none<Record<string, unknown>>();
	}
	const inlineMcp = Object.fromEntries(Object.entries(mcpServers));
	return Option.some(inlineMcp);
};

const inferredManifest = (input: {
	readonly pluginName: string;
	readonly sourceManifest: Option.Option<PluginManifest>;
	readonly commandsSpec: string | ReadonlyArray<string> | undefined;
	readonly agentsSpec: string | ReadonlyArray<string> | undefined;
	readonly skillsSpec: string | ReadonlyArray<string> | undefined;
	readonly outputStylesSpec: string | ReadonlyArray<string> | undefined;
	readonly hooksSpec: PluginManifest['hooks'];
	readonly mcpSpec: PluginManifest['mcpServers'];
	readonly commandCount: number;
	readonly agentCount: number;
	readonly skillCount: number;
	readonly outputStyleCount: number;
	readonly hasHooks: boolean;
	readonly hasMcp: boolean;
}): PluginManifest => {
	const base = Option.match(input.sourceManifest, {
		onNone: () => ({ name: input.pluginName }),
		onSome: (manifest) => ({
			name: manifest.name,
			version: manifest.version,
			description: manifest.description,
			author: manifest.author,
			homepage: manifest.homepage,
			repository: manifest.repository,
			license: manifest.license,
			keywords: manifest.keywords,
			userConfig: manifest.userConfig,
			channels: manifest.channels
		})
	});

	return new PluginManifest({
		...base,
		...(input.commandCount > 0
			? { commands: input.commandsSpec ?? 'commands' }
			: {}),
		...(input.agentCount > 0 ? { agents: input.agentsSpec ?? 'agents' } : {}),
		...(input.skillCount > 0 ? { skills: input.skillsSpec ?? 'skills' } : {}),
		...(input.outputStyleCount > 0
			? { outputStyles: input.outputStylesSpec ?? 'output-styles' }
			: {}),
		...(input.hasHooks ? { hooks: input.hooksSpec ?? 'hooks/hooks.json' } : {}),
		...(input.hasMcp ? { mcpServers: input.mcpSpec ?? '.mcp.json' } : {})
	});
};

const toPluginConfig = (input: {
	readonly manifest: PluginManifest;
	readonly commands: ReadonlyArray<PluginCommandEntry>;
	readonly agents: ReadonlyArray<PluginAgentEntry>;
	readonly skills: ReadonlyArray<PluginSkillEntry>;
	readonly outputStyles: ReadonlyArray<PluginOutputStyleEntry>;
	readonly hooksConfig: Option.Option<Schema.Schema.Type<typeof HooksSection>>;
	readonly mcpConfig: Option.Option<McpJsonFile>;
}) => ({
	manifest: input.manifest,
	commands: input.commands,
	agents: input.agents,
	skills: input.skills,
	outputStyles: input.outputStyles,
	...(Option.isSome(input.hooksConfig)
		? { hooksConfig: input.hooksConfig.value }
		: {}),
	...(Option.isSome(input.mcpConfig)
		? { mcpConfig: input.mcpConfig.value }
		: {})
});

const loadCommandEntries = (
	rootDir: string,
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginCommandEntry>,
	PluginLoadError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return yield* Effect.forEach(paths, (filePath) =>
			parseCommandFile(filePath).pipe(
				Effect.map((parsed) => ({
					name: path.basename(filePath, '.md'),
					path: path.relative(rootDir, filePath),
					frontmatter: parsed.frontmatter,
					body: parsed.body
				})),
				Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
			)
		);
	});

const loadAgentEntries = (
	rootDir: string,
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginAgentEntry>,
	PluginLoadError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return yield* Effect.forEach(paths, (filePath) =>
			parseSubagentFile(filePath).pipe(
				Effect.map((parsed) => ({
					name: parsed.frontmatter.name,
					path: path.relative(rootDir, filePath),
					frontmatter: parsed.frontmatter,
					body: parsed.body
				})),
				Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
			)
		);
	});

const loadSkillEntries = (
	rootDir: string,
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginSkillEntry>,
	PluginLoadError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return yield* Effect.forEach(paths, (filePath) =>
			parseSkillFile(filePath).pipe(
				Effect.map((parsed) => ({
					name: parsed.frontmatter.name,
					path: path.relative(rootDir, filePath),
					frontmatter: parsed.frontmatter,
					body: parsed.body
				})),
				Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
			)
		);
	});

const loadOutputStyleEntries = (
	rootDir: string,
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginOutputStyleEntry>,
	PluginLoadError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		return yield* Effect.forEach(paths, (filePath) =>
			parseOutputStyleFile(filePath).pipe(
				Effect.map((parsed) => ({
					name: parsed.frontmatter.name,
					path: path.relative(rootDir, filePath),
					frontmatter: parsed.frontmatter,
					body: parsed.body
				})),
				Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
			)
		);
	});

const mergeHooksConfigs = (
	configs: ReadonlyArray<Schema.Schema.Type<typeof HooksSection>>
): Schema.Schema.Type<typeof HooksSection> => {
	const merged: Record<string, Array<unknown>> = {};
	for (const config of configs) {
		for (const [eventName, groups] of Object.entries(config)) {
			merged[eventName] = [...(merged[eventName] ?? []), ...groups];
		}
	}
	return Schema.decodeUnknownSync(HooksSection)(merged);
};

const mergeMcpConfigs = (
	configs: ReadonlyArray<McpJsonFile>
): McpJsonFile =>
	new McpJsonFile({
		mcpServers: Object.assign({}, ...configs.map((config) => config.mcpServers))
	});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspect a plugin directory and infer the canonical manifest paths for the
 * discovered component files.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const scan = (
	rootDir: string
): Effect.Effect<PluginScan, PluginLoadError, FileSystem.FileSystem | Path.Path> =>
	Effect.fn('Plugin.scan')(function* (rootDir: string) {
		yield* Effect.annotateCurrentSpan('plugin.rootDir', rootDir);
		const path = yield* Path.Path;
		const manifestPath = path.join(rootDir, '.claude-plugin', manifestFileName);

		const sourceManifest = yield* readOptionalManifest(manifestPath);
		const manifest = Option.getOrUndefined(sourceManifest);
		const commandPaths = yield* expandMarkdownPathSpec({
			rootDir,
			spec: manifest?.commands,
			fallbackDir: 'commands'
		});
		const agentPaths = yield* expandMarkdownPathSpec({
			rootDir,
			spec: manifest?.agents,
			fallbackDir: 'agents'
		});
		const skillPaths = yield* expandSkillPathSpec({
			rootDir,
			spec: manifest?.skills,
			fallbackDir: 'skills'
		});
		const outputStylePaths = yield* expandMarkdownPathSpec({
			rootDir,
			spec: manifest?.outputStyles,
			fallbackDir: 'output-styles'
		});
		const inlineHooksConfig = inlineHooksConfigFromManifest(manifest);
		const hooksPaths = Option.isSome(inlineHooksConfig)
			? []
			: yield* expandJsonPathSpec({
					rootDir,
					spec:
						typeof manifest?.hooks === 'string' || Array.isArray(manifest?.hooks)
							? manifest?.hooks
							: undefined,
					fallbackPath: 'hooks/hooks.json'
				});
		const inlineMcpSpec = inlineMcpSpecFromManifest(manifest);
		const inlineMcpConfig = Option.isSome(inlineMcpSpec)
			? Option.some(
					yield* Schema.decodeUnknownEffect(McpJsonFile)({
						mcpServers: inlineMcpSpec.value
					}).pipe(
						Effect.mapError(
							(cause) => new PluginLoadError({ path: manifestPath, cause })
						)
					)
			  )
			: Option.none<McpJsonFile>();
		const mcpPaths = Option.isSome(inlineMcpConfig)
			? []
			: yield* expandJsonPathSpec({
					rootDir,
					spec:
						typeof manifest?.mcpServers === 'string' ||
						Array.isArray(manifest?.mcpServers)
							? manifest?.mcpServers
							: undefined,
					fallbackPath: '.mcp.json'
				});
		const pluginName = Option.match(sourceManifest, {
			onNone: () => path.basename(rootDir),
			onSome: (manifest) => manifest.name
		});

		return {
			rootDir,
			manifestPath: Option.isSome(sourceManifest)
				? Option.some(manifestPath)
				: Option.none(),
				sourceManifest,
				commandPaths,
				agentPaths,
				skillPaths,
				outputStylePaths,
				hooksPaths,
				inlineHooksConfig,
				mcpPaths,
				inlineMcpConfig,
				inferredManifest: inferredManifest({
					pluginName,
					sourceManifest,
					commandsSpec: manifest?.commands,
					agentsSpec: manifest?.agents,
					skillsSpec: manifest?.skills,
					outputStylesSpec: manifest?.outputStyles,
					hooksSpec: manifest?.hooks,
					mcpSpec: manifest?.mcpServers,
					commandCount: commandPaths.length,
					agentCount: agentPaths.length,
					skillCount: skillPaths.length,
					outputStyleCount: outputStylePaths.length,
					hasHooks:
						Option.isSome(inlineHooksConfig) || hooksPaths.length > 0,
					hasMcp: Option.isSome(inlineMcpConfig) || mcpPaths.length > 0
				})
			};
		})(rootDir);

/**
 * Load an existing plugin directory into a typed `PluginDefinition`.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const load = (
	rootDir: string
): Effect.Effect<LoadedPlugin, PluginLoadError, FileSystem.FileSystem | Path.Path> =>
	Effect.fn('Plugin.load')(function* (rootDir: string) {
		const scanned = yield* scan(rootDir);
		const commands = yield* loadCommandEntries(rootDir, scanned.commandPaths);
		const agents = yield* loadAgentEntries(rootDir, scanned.agentPaths);
		const skills = yield* loadSkillEntries(rootDir, scanned.skillPaths);
		const outputStyles = yield* loadOutputStyleEntries(
			rootDir,
			scanned.outputStylePaths
		);
		const hooksConfig = Option.isSome(scanned.inlineHooksConfig)
			? Option.some(scanned.inlineHooksConfig.value)
			: scanned.hooksPaths.length === 0
				? Option.none<Schema.Schema.Type<typeof HooksSection>>()
				: Option.some(
						mergeHooksConfigs(
							yield* Effect.forEach(scanned.hooksPaths, readHooksFile)
						)
				  );
		const mcpConfig = Option.isSome(scanned.inlineMcpConfig)
			? Option.some(scanned.inlineMcpConfig.value)
			: scanned.mcpPaths.length === 0
				? Option.none<McpJsonFile>()
				: Option.some(
						mergeMcpConfigs(
							yield* Effect.forEach(scanned.mcpPaths, readMcpFile)
						)
				  );

		const definition = define(
			toPluginConfig({
				manifest: scanned.inferredManifest,
				commands,
				agents,
				skills,
				outputStyles,
				hooksConfig,
				mcpConfig
			})
		);

		return {
			...definition,
			rootDir,
			sourceManifest: scanned.sourceManifest,
			inferredManifest: scanned.inferredManifest
		};
	})(rootDir);

/**
 * Normalize a plugin definition's manifest by preserving explicit layout
 * choices and filling in default paths for missing component/config entries.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const sync = (
	definition: PluginDefinition | LoadedPlugin
): PluginDefinition =>
	define(
		toPluginConfig({
			manifest: syncManifest(definition),
			commands: definition.commands,
			agents: definition.agents,
			skills: definition.skills,
			outputStyles: definition.outputStyles,
			hooksConfig: definition.hooksConfig,
			mcpConfig: definition.mcpConfig
		})
	);
