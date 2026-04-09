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

import { PluginWriteError } from '../Errors.ts';
import { PluginManifest } from './Manifest.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single component file to be written into the plugin directory.
 * The `name` is used to derive the file name (e.g. `commit` ->
 * `commit.md`); the `content` is the complete file body including
 * any YAML frontmatter.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginFileEntry {
	readonly name: string;
	readonly content: string;
}

type PluginManifestInput = ConstructorParameters<typeof PluginManifest>[0];

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
	readonly commands?: ReadonlyArray<PluginFileEntry>;
	readonly agents?: ReadonlyArray<PluginFileEntry>;
	readonly skills?: ReadonlyArray<PluginFileEntry>;
	readonly outputStyles?: ReadonlyArray<PluginFileEntry>;
	readonly hooksConfig?: Record<string, unknown>;
	readonly mcpConfig?: Record<string, unknown>;
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
	readonly commands: ReadonlyArray<PluginFileEntry>;
	readonly agents: ReadonlyArray<PluginFileEntry>;
	readonly skills: ReadonlyArray<PluginFileEntry>;
	readonly outputStyles: ReadonlyArray<PluginFileEntry>;
	readonly hooksConfig: Option.Option<Record<string, unknown>>;
	readonly mcpConfig: Option.Option<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

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
 *     { name: 'greet', content: '# /greet\n\nSay hi.\n' }
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
	agents: config.agents ?? [],
	skills: config.skills ?? [],
	outputStyles: config.outputStyles ?? [],
	hooksConfig:
		config.hooksConfig === undefined
			? Option.none()
			: Option.some(config.hooksConfig),
	mcpConfig:
		config.mcpConfig === undefined
			? Option.none()
			: Option.some(config.mcpConfig)
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
const writeFlatEntries = (
	dir: string,
	entries: ReadonlyArray<PluginFileEntry>,
	extension: string
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
			writeFile(path.join(dir, `${entry.name}${extension}`), entry.content)
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
	entries: ReadonlyArray<PluginFileEntry>
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
				yield* writeFile(path.join(dir, 'SKILL.md'), entry.content);
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
 *   commands: [{ name: 'hi', content: '# /hi\n' }]
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
		yield* writeFlatEntries(
			path.join(destDir, 'commands'),
			definition.commands,
			'.md'
		);

		// agents/<name>.md
		yield* writeFlatEntries(
			path.join(destDir, 'agents'),
			definition.agents,
			'.md'
		);

		// skills/<name>/SKILL.md
		yield* writeSkillEntries(
			path.join(destDir, 'skills'),
			definition.skills
		);

		// output-styles/<name>.md
		yield* writeFlatEntries(
			path.join(destDir, 'output-styles'),
			definition.outputStyles,
			'.md'
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
