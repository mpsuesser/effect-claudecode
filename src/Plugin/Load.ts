/**
 * Plugin directory scanning and loading.
 *
 * Complements `Plugin.write` with the inverse operations for existing plugin
 * directories: `scan` inspects canonical component locations and infers a
 * normalized manifest, `load` parses the discovered files into a typed
 * `PluginDefinition`, and `sync` rewrites a definition's manifest paths to the
 * canonical layout produced by `Plugin.write`.
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
import { type McpJsonFile, loadJson as loadMcpJson } from '../Mcp.ts';
import { HooksSection } from '../Settings/HooksSection.ts';
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
	readonly hooksPath: Option.Option<string>;
	readonly mcpPath: Option.Option<string>;
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

const skillFilePaths = (
	skillsDir: string,
	entries: ReadonlyArray<string>,
	path: Path.Path
): ReadonlyArray<string> =>
	listSorted(entries.map((entry) => path.join(skillsDir, entry, 'SKILL.md')));

const inferredManifest = (input: {
	readonly pluginName: string;
	readonly sourceManifest: Option.Option<PluginManifest>;
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
		...(input.commandCount > 0 ? { commands: 'commands' } : {}),
		...(input.agentCount > 0 ? { agents: 'agents' } : {}),
		...(input.skillCount > 0 ? { skills: 'skills' } : {}),
		...(input.outputStyleCount > 0 ? { outputStyles: 'output-styles' } : {}),
		...(input.hasHooks ? { hooks: 'hooks/hooks.json' } : {}),
		...(input.hasMcp ? { mcpServers: '.mcp.json' } : {})
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
					frontmatter: parsed.frontmatter,
					body: parsed.body
				})),
				Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
			)
		);
	});

const loadAgentEntries = (
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginAgentEntry>,
	PluginLoadError,
	FileSystem.FileSystem
> =>
	Effect.forEach(paths, (filePath) =>
		parseSubagentFile(filePath).pipe(
			Effect.map((parsed) => ({
				name: parsed.frontmatter.name,
				frontmatter: parsed.frontmatter,
				body: parsed.body
			})),
			Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
		)
	);

const loadSkillEntries = (
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginSkillEntry>,
	PluginLoadError,
	FileSystem.FileSystem
> =>
	Effect.forEach(paths, (filePath) =>
		parseSkillFile(filePath).pipe(
			Effect.map((parsed) => ({
				name: parsed.frontmatter.name,
				frontmatter: parsed.frontmatter,
				body: parsed.body
			})),
			Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
		)
	);

const loadOutputStyleEntries = (
	paths: ReadonlyArray<string>
): Effect.Effect<
	ReadonlyArray<PluginOutputStyleEntry>,
	PluginLoadError,
	FileSystem.FileSystem
> =>
	Effect.forEach(paths, (filePath) =>
		parseOutputStyleFile(filePath).pipe(
			Effect.map((parsed) => ({
				name: parsed.frontmatter.name,
				frontmatter: parsed.frontmatter,
				body: parsed.body
			})),
			Effect.mapError((cause) => new PluginLoadError({ path: filePath, cause }))
		)
	);

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
		const commandsDir = path.join(rootDir, 'commands');
		const agentsDir = path.join(rootDir, 'agents');
		const skillsDir = path.join(rootDir, 'skills');
		const outputStylesDir = path.join(rootDir, 'output-styles');
		const hooksPath = path.join(rootDir, 'hooks', 'hooks.json');
		const mcpPath = path.join(rootDir, '.mcp.json');

		const sourceManifest = yield* readOptionalManifest(manifestPath);
		const commandEntries = yield* readDirectoryIfExists(commandsDir);
		const agentEntries = yield* readDirectoryIfExists(agentsDir);
		const skillEntries = yield* readDirectoryIfExists(skillsDir);
		const outputStyleEntries = yield* readDirectoryIfExists(outputStylesDir);
		const maybeHooks = yield* readOptionalStringFile(hooksPath);
		const maybeMcp = yield* readOptionalStringFile(mcpPath);

		const commandPaths = markdownFilePaths(commandsDir, commandEntries, path);
		const agentPaths = markdownFilePaths(agentsDir, agentEntries, path);
		const skillPaths = skillFilePaths(skillsDir, skillEntries, path);
		const outputStylePaths = markdownFilePaths(
			outputStylesDir,
			outputStyleEntries,
			path
		);
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
			hooksPath: Option.map(maybeHooks, () => hooksPath),
			mcpPath: Option.map(maybeMcp, () => mcpPath),
			inferredManifest: inferredManifest({
				pluginName,
				sourceManifest,
				commandCount: commandPaths.length,
				agentCount: agentPaths.length,
				skillCount: skillPaths.length,
				outputStyleCount: outputStylePaths.length,
				hasHooks: Option.isSome(maybeHooks),
				hasMcp: Option.isSome(maybeMcp)
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
		const commands = yield* loadCommandEntries(scanned.commandPaths);
		const agents = yield* loadAgentEntries(scanned.agentPaths);
		const skills = yield* loadSkillEntries(scanned.skillPaths);
		const outputStyles = yield* loadOutputStyleEntries(scanned.outputStylePaths);
		const hooksConfig = yield* Option.match(scanned.hooksPath, {
			onNone: () => Effect.succeed(Option.none<Schema.Schema.Type<typeof HooksSection>>()),
			onSome: readOptionalHooks
		});
		const mcpConfig = yield* Option.match(scanned.mcpPath, {
			onNone: () => Effect.succeed(Option.none()),
			onSome: (mcpPath) =>
				loadMcpJson(mcpPath).pipe(
					Effect.map(Option.some),
					Effect.mapError(
						(cause) => new PluginLoadError({ path: mcpPath, cause })
					)
				)
		});

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
 * Normalize a plugin definition's manifest paths to the canonical layout used
 * by `Plugin.write`.
 *
 * @category Loaders
 * @since 0.1.0
 */
export const sync = (
	definition: PluginDefinition | LoadedPlugin
): PluginDefinition =>
	define(
		toPluginConfig({
			manifest: inferredManifest({
				pluginName: definition.manifest.name,
				sourceManifest: Option.some(definition.manifest),
				commandCount: definition.commands.length,
				agentCount: definition.agents.length,
				skillCount: definition.skills.length,
				outputStyleCount: definition.outputStyles.length,
				hasHooks: Option.isSome(definition.hooksConfig),
				hasMcp: Option.isSome(definition.mcpConfig)
			}),
			commands: definition.commands,
			agents: definition.agents,
			skills: definition.skills,
			outputStyles: definition.outputStyles,
			hooksConfig: definition.hooksConfig,
			mcpConfig: definition.mcpConfig
		})
	);
