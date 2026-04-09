/**
 * `Plugin.define` + `Plugin.write` — the ergonomic builder for
 * Claude Code plugins.
 *
 * `Plugin.define` validates a plugin manifest and bundles it with the
 * component files (commands, agents, skills, output styles) plus
 * optional hooks/MCP inline configs. `Plugin.write` materializes a
 * definition to a destination directory via the injected `FileSystem`
 * and `Path` services, producing the canonical directory layout:
 *
 * ```text
 * destDir/
 * ├── .claude-plugin/
 * │   └── plugin.json
 * ├── commands/<name>.md
 * ├── agents/<name>.md
 * ├── skills/<name>/SKILL.md
 * ├── output-styles/<name>.md
 * ├── hooks/hooks.json          (if hooksConfig provided)
 * └── .mcp.json                 (if mcpConfig provided)
 * ```
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';

import { PluginWriteError } from '../Errors.ts';
import {
	type CommandFrontmatterInput,
	type OutputStyleFrontmatterInput,
	renderCommand,
	renderOutputStyle,
	renderSkill,
	renderSubagent,
	type SkillFrontmatterInput,
	type SubagentFrontmatterInput,
	CommandFrontmatter,
	OutputStyleFrontmatter,
	SkillFrontmatter,
	SubagentFrontmatter
} from '../Frontmatter.ts';
import { McpJsonFile, type McpJsonFileInput } from '../Mcp.ts';
import { HooksSection } from '../Settings/HooksSection.ts';
import { PluginManifest } from './Manifest.ts';

type HooksConfig = Schema.Schema.Type<typeof HooksSection>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A typed slash-command entry to be written to `commands/<name>.md`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginCommandEntry {
	readonly name: string;
	readonly frontmatter: CommandFrontmatter;
	readonly body: string;
}

/**
 * A typed subagent entry to be written to `agents/<name>.md`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginAgentEntry {
	readonly name: string;
	readonly frontmatter: SubagentFrontmatter;
	readonly body: string;
}

/**
 * A typed skill entry to be written to `skills/<name>/SKILL.md`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginSkillEntry {
	readonly name: string;
	readonly frontmatter: SkillFrontmatter;
	readonly body: string;
}

/**
 * A typed output-style entry to be written to `output-styles/<name>.md`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginOutputStyleEntry {
	readonly name: string;
	readonly frontmatter: OutputStyleFrontmatter;
	readonly body: string;
}

export type PluginManifestInput = ConstructorParameters<typeof PluginManifest>[0];

export type PluginCommandConfig = CommandFrontmatterInput & {
	readonly name: string;
	readonly body: string;
};

export type PluginAgentConfig = Omit<SubagentFrontmatterInput, 'name'> & {
	readonly name: string;
	readonly body: string;
};

export type PluginSkillConfig = Omit<SkillFrontmatterInput, 'name'> & {
	readonly name: string;
	readonly body: string;
};

export type PluginOutputStyleConfig = Omit<
	OutputStyleFrontmatterInput,
	'name'
> & {
	readonly name: string;
	readonly body: string;
};

/**
 * Config passed to `Plugin.define`. The `manifest` field accepts
 * either a `PluginManifest` instance or a plain object that satisfies
 * its constructor; the latter is validated on entry.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginConfig {
	readonly manifest: PluginManifest | PluginManifestInput;
	readonly commands?: ReadonlyArray<PluginCommandEntry>;
	readonly agents?: ReadonlyArray<PluginAgentEntry>;
	readonly skills?: ReadonlyArray<PluginSkillEntry>;
	readonly outputStyles?: ReadonlyArray<PluginOutputStyleEntry>;
	readonly hooksConfig?: HooksConfig;
	readonly mcpConfig?: McpJsonFile | McpJsonFileInput;
}

/**
 * The fully-formed plugin definition ready to be written. Components
 * default to empty arrays; optional config files default to `None`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginDefinition {
	readonly manifest: PluginManifest;
	readonly commands: ReadonlyArray<PluginCommandEntry>;
	readonly agents: ReadonlyArray<PluginAgentEntry>;
	readonly skills: ReadonlyArray<PluginSkillEntry>;
	readonly outputStyles: ReadonlyArray<PluginOutputStyleEntry>;
	readonly hooksConfig: Option.Option<HooksConfig>;
	readonly mcpConfig: Option.Option<McpJsonFile>;
}

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

/**
 * Build a typed slash-command entry.
 *
 * @category Builders
 * @since 0.1.0
 */
export const command = (config: PluginCommandConfig): PluginCommandEntry => {
	const { name, body, ...frontmatter } = config;
	return {
		name,
		frontmatter: new CommandFrontmatter(frontmatter),
		body
	};
};

/**
 * Build a typed subagent entry.
 *
 * @category Builders
 * @since 0.1.0
 */
export const agent = (config: PluginAgentConfig): PluginAgentEntry => {
	const { name, body, ...frontmatter } = config;
	return {
		name,
		frontmatter: new SubagentFrontmatter({ name, ...frontmatter }),
		body
	};
};

/**
 * Build a typed skill entry.
 *
 * @category Builders
 * @since 0.1.0
 */
export const skill = (config: PluginSkillConfig): PluginSkillEntry => {
	const { name, body, ...frontmatter } = config;
	return {
		name,
		frontmatter: new SkillFrontmatter({ name, ...frontmatter }),
		body
	};
};

/**
 * Build a typed output-style entry.
 *
 * @category Builders
 * @since 0.1.0
 */
export const outputStyle = (
	config: PluginOutputStyleConfig
): PluginOutputStyleEntry => {
	const { name, body, ...frontmatter } = config;
	return {
		name,
		frontmatter: new OutputStyleFrontmatter({ name, ...frontmatter }),
		body
	};
};

const normalizeHooksConfig = (
	hooksConfig: HooksConfig | undefined
): Option.Option<HooksConfig> =>
	hooksConfig === undefined
		? Option.none()
		: Option.some(Schema.decodeUnknownSync(HooksSection)(hooksConfig));

const normalizeMcpConfig = (
	mcpConfig: McpJsonFile | McpJsonFileInput | undefined
): Option.Option<McpJsonFile> =>
	mcpConfig === undefined
		? Option.none()
		: Option.some(
				mcpConfig instanceof McpJsonFile
					? mcpConfig
					: Schema.decodeUnknownSync(McpJsonFile)(mcpConfig)
		  );

const validateNamedFrontmatter = (
	entryName: string,
	frontmatterName: string,
	kind: string
): void => {
	if (entryName !== frontmatterName) {
		throw new Error(
			`${kind} entry name "${entryName}" must match frontmatter name "${frontmatterName}"`
		);
	}
};

const normalizeAgentEntry = (entry: PluginAgentEntry): PluginAgentEntry => {
	validateNamedFrontmatter(entry.name, entry.frontmatter.name, 'agent');
	return entry;
};

const normalizeSkillEntry = (entry: PluginSkillEntry): PluginSkillEntry => {
	validateNamedFrontmatter(entry.name, entry.frontmatter.name, 'skill');
	return entry;
};

const normalizeOutputStyleEntry = (
	entry: PluginOutputStyleEntry
): PluginOutputStyleEntry => {
	validateNamedFrontmatter(
		entry.name,
		entry.frontmatter.name,
		'output style'
	);
	return entry;
};

/**
 * Build a `PluginDefinition` from a plain config object. If
 * `config.manifest` is a raw object, it is passed through the
 * `PluginManifest` constructor (which enforces the schema) before
 * being stored. Component arrays default to empty; optional config
 * files become `Option.none()` when absent.
 *
 * @category Builders
 * @since 0.1.0
 * @example
 * ```ts
 * import { Plugin } from 'effect-claudecode'
 *
 * const def = Plugin.define({
 *   manifest: { name: 'my-plugin', version: '0.1.0' },
 *   commands: [
 *     Plugin.command({
 *       name: 'greet',
 *       description: 'Say hi',
 *       body: '# /greet\n\nSay hi.\n'
 *     })
 *   ]
 * })
 * ```
 */
export const define = (config: PluginConfig): PluginDefinition => ({
	manifest:
		config.manifest instanceof PluginManifest
			? config.manifest
			: new PluginManifest(config.manifest),
	commands: config.commands ?? [],
	agents: (config.agents ?? []).map(normalizeAgentEntry),
	skills: (config.skills ?? []).map(normalizeSkillEntry),
	outputStyles: (config.outputStyles ?? []).map(normalizeOutputStyleEntry),
	hooksConfig: normalizeHooksConfig(config.hooksConfig),
	mcpConfig: normalizeMcpConfig(config.mcpConfig)
});

// ---------------------------------------------------------------------------
// write — internal helpers
// ---------------------------------------------------------------------------

const writeFile = (
	filePath: string,
	content: string
): Effect.Effect<void, PluginWriteError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs
			.writeFileString(filePath, content)
			.pipe(
				Effect.mapError(
					(cause) => new PluginWriteError({ path: filePath, cause })
				)
			);
	});

const makeDir = (
	dirPath: string
): Effect.Effect<void, PluginWriteError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		yield* fs
			.makeDirectory(dirPath, { recursive: true })
			.pipe(
				Effect.mapError(
					(cause) => new PluginWriteError({ path: dirPath, cause })
				)
			);
	});

/**
 * Write a flat list of component files into a directory. For each
 * entry, the file name is `${entry.name}${extension}` and the content
 * is written verbatim. If the entry list is empty, the directory is
 * not created.
 *
 * @internal
 */
const writeCommandEntries = (
	dir: string,
	entries: ReadonlyArray<PluginCommandEntry>
): Effect.Effect<
	void,
	PluginWriteError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		if (entries.length === 0) return;
		const path = yield* Path.Path;
		yield* makeDir(dir);
		yield* Effect.forEach(entries, (entry) =>
			writeFile(
				path.join(dir, `${entry.name}.md`),
				renderCommand(entry.frontmatter, entry.body)
			)
		);
	});

const writeFlatNamedEntries = <Entry extends { readonly name: string }>(
	dir: string,
	entries: ReadonlyArray<Entry>,
	renderEntry: (entry: Entry) => string
): Effect.Effect<
	void,
	PluginWriteError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		if (entries.length === 0) return;
		const path = yield* Path.Path;
		yield* makeDir(dir);
		yield* Effect.forEach(entries, (entry) =>
			writeFile(path.join(dir, `${entry.name}.md`), renderEntry(entry))
		);
	});

/**
 * Write skill entries, each into its own subdirectory with a
 * `SKILL.md` file. This matches Claude Code's canonical skill
 * layout: `skills/<name>/SKILL.md`.
 *
 * @internal
 */
const writeSkillEntries = (
	skillsDir: string,
	entries: ReadonlyArray<PluginSkillEntry>
): Effect.Effect<
	void,
	PluginWriteError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		if (entries.length === 0) return;
		const path = yield* Path.Path;
		yield* makeDir(skillsDir);
		yield* Effect.forEach(entries, (entry) =>
			Effect.gen(function* () {
				const dir = path.join(skillsDir, entry.name);
				yield* makeDir(dir);
				yield* writeFile(
					path.join(dir, 'SKILL.md'),
					renderSkill(entry.frontmatter, entry.body)
				);
			})
		);
	});

/**
 * Serialize a JSON-serializable value to a pretty-printed string
 * with a trailing newline. Plugin manifests, `hooks/hooks.json`, and
 * `.mcp.json` all go through here to keep formatting consistent.
 *
 * @internal
 */
const toJsonFileContent = (value: unknown): string =>
	// eslint-disable-next-line avoid-direct-json -- writing the manifest IS
	// the whole purpose of Plugin.write; there's no Schema-level pretty
	// printer that preserves 2-space indent.
	`${JSON.stringify(value, null, 2)}\n`;

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

/**
 * Materialize a `PluginDefinition` to a destination directory.
 *
 * The write order is deterministic: manifest first, then component
 * directories in the order `commands`, `agents`, `skills`,
 * `outputStyles`, then (optionally) `hooks/hooks.json`, then
 * (optionally) `.mcp.json`. Any filesystem error is wrapped in a
 * `PluginWriteError` carrying the offending path.
 *
 * Requires `FileSystem` and `Path` services in the environment; pick
 * your preferred platform layer at the call site (for example
 * `NodeFileSystem.layer` + `NodePath.layer` under Node).
 *
 * @category Writers
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import * as Layer from 'effect/Layer'
 * import { NodeFileSystem } from '@effect/platform-node'
 * import { NodePath } from '@effect/platform-node'
 * import { Plugin } from 'effect-claudecode'
 *
 * const def = Plugin.define({
 *   manifest: { name: 'my-plugin' },
 *   commands: [
 *     Plugin.command({ name: 'hi', body: '# /hi\n' })
 *   ]
 * })
 *
 * Effect.runPromise(
 *   Plugin.write(def, '/tmp/my-plugin').pipe(
 *     Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
 *   )
 * )
 * ```
 */
export const write = (
	definition: PluginDefinition,
	destDir: string
): Effect.Effect<
	void,
	PluginWriteError,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const path = yield* Path.Path;

		// .claude-plugin/plugin.json
		const claudePluginDir = path.join(destDir, '.claude-plugin');
		yield* makeDir(claudePluginDir);
		yield* writeFile(
			path.join(claudePluginDir, 'plugin.json'),
			toJsonFileContent(definition.manifest)
		);

		// commands/<name>.md
		yield* writeCommandEntries(
			path.join(destDir, 'commands'),
			definition.commands
		);

		// agents/<name>.md
		yield* writeFlatNamedEntries(
			path.join(destDir, 'agents'),
			definition.agents,
			(entry) => renderSubagent(entry.frontmatter, entry.body)
		);

		// skills/<name>/SKILL.md
		yield* writeSkillEntries(
			path.join(destDir, 'skills'),
			definition.skills
		);

		// output-styles/<name>.md
		yield* writeFlatNamedEntries(
			path.join(destDir, 'output-styles'),
			definition.outputStyles,
			(entry) => renderOutputStyle(entry.frontmatter, entry.body)
		);

		// hooks/hooks.json
		if (Option.isSome(definition.hooksConfig)) {
			const hooksDir = path.join(destDir, 'hooks');
			yield* makeDir(hooksDir);
			yield* writeFile(
				path.join(hooksDir, 'hooks.json'),
				toJsonFileContent(definition.hooksConfig.value)
			);
		}

		// .mcp.json
		if (Option.isSome(definition.mcpConfig)) {
			yield* writeFile(
				path.join(destDir, '.mcp.json'),
				toJsonFileContent(definition.mcpConfig.value)
			);
		}
	});
