/**
 * Project-scoped cached loaders for effect-claudecode programs.
 *
 * `ClaudeProject` centralizes repeated reads of the current repository's Claude
 * Code state (`settings.json`, `.mcp.json`, plugin directories) behind a
 * service with explicit invalidation effects.
 *
 * @since 0.1.0
 */
import { Duration } from 'effect';
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as ServiceMap from 'effect/ServiceMap';

import { McpConfigError } from './Errors.ts';
import * as Mcp from './Mcp.ts';
import * as Plugin from './Plugin.ts';
import * as Settings from './Settings.ts';

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * Configuration for `ClaudeProject.layer`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface ClaudeProjectOptions {
	readonly cwd: string;
	readonly pluginRoot?: string;
	readonly mcpPath?: string;
}

/**
 * Explicit cache invalidators for the project service.
 *
 * @category Models
 * @since 0.1.0
 */
export interface ClaudeProjectInvalidate {
	readonly settings: Effect.Effect<void>;
	readonly mcp: Effect.Effect<void>;
	readonly plugin: Effect.Effect<void>;
	readonly all: Effect.Effect<void>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-namespace */
export namespace ClaudeProject {
	/**
	 * The project service interface.
	 *
	 * @category Service
	 * @since 0.1.0
	 */
	export interface Interface {
		readonly cwd: string;
		readonly pluginRoot: string;
		readonly mcpPath: string;
		readonly settings: Effect.Effect<
			Settings.SettingsFile,
			| import('effect/Config').ConfigError
			| import('./Errors.ts').SettingsReadError
			| import('./Errors.ts').SettingsParseError
			| import('./Errors.ts').SettingsDecodeError
		>;
		readonly mcp: Effect.Effect<Option.Option<Mcp.McpJsonFile>, McpConfigError>;
		readonly plugin: Effect.Effect<Plugin.LoadedPlugin, import('./Errors.ts').PluginLoadError>;
		readonly skill: (name: string) => Effect.Effect<Option.Option<Plugin.PluginSkillEntry>, import('./Errors.ts').PluginLoadError>;
		readonly command: (name: string) => Effect.Effect<Option.Option<Plugin.PluginCommandEntry>, import('./Errors.ts').PluginLoadError>;
		readonly agent: (name: string) => Effect.Effect<Option.Option<Plugin.PluginAgentEntry>, import('./Errors.ts').PluginLoadError>;
		readonly outputStyle: (name: string) => Effect.Effect<Option.Option<Plugin.PluginOutputStyleEntry>, import('./Errors.ts').PluginLoadError>;
		readonly invalidate: ClaudeProjectInvalidate;
	}

	/**
	 * The project service tag.
	 *
	 * @category Service
	 * @since 0.1.0
	 */
	export class Service extends ServiceMap.Service<Service, Interface>()(
		'effect-claudecode/ClaudeProject'
	) {}

	/**
	 * Construct the project service layer.
	 *
	 * @category Layers
	 * @since 0.1.0
	 */
	export const layer = (
		options: ClaudeProjectOptions
	): Layer.Layer<Service, never, FileSystem.FileSystem | Path.Path> =>
		Layer.effect(
			Service,
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const path = yield* Path.Path;
				const pluginRoot = options.pluginRoot ?? options.cwd;
				const mcpPath = options.mcpPath ?? path.join(options.cwd, '.mcp.json');
				const providePlatform = <A, E, R>(
					effect: Effect.Effect<A, E, R>
				): Effect.Effect<A, E, Exclude<R, FileSystem.FileSystem | Path.Path>> =>
					effect.pipe(
						Effect.provideService(FileSystem.FileSystem, fs),
						Effect.provideService(Path.Path, path)
					) as never;

				const [settings, invalidateSettings] = yield* Effect.cachedInvalidateWithTTL(
					providePlatform(Settings.load(options.cwd)),
					Duration.infinity
				);
				const [mcp, invalidateMcp] = yield* Effect.cachedInvalidateWithTTL(
					providePlatform(
						Effect.gen(function* () {
						const exists = yield* fs.exists(mcpPath).pipe(
							Effect.mapError(
								(cause) => new McpConfigError({ path: mcpPath, cause })
							)
						);
						if (!exists) {
							return Option.none<Mcp.McpJsonFile>();
						}
						return Option.some(yield* Mcp.loadJson(mcpPath));
						})
					),
					Duration.infinity
				);
				const [plugin, invalidatePlugin] = yield* Effect.cachedInvalidateWithTTL(
					providePlatform(Plugin.load(pluginRoot)),
					Duration.infinity
				);

				const skill = (name: string) =>
					plugin.pipe(
						Effect.map((loaded) =>
							Arr.findFirst(loaded.skills, (entry) => entry.name === name)
						)
					);
				const command = (name: string) =>
					plugin.pipe(
						Effect.map((loaded) =>
							Arr.findFirst(loaded.commands, (entry) => entry.name === name)
						)
					);
				const agent = (name: string) =>
					plugin.pipe(
						Effect.map((loaded) =>
							Arr.findFirst(loaded.agents, (entry) => entry.name === name)
						)
					);
				const outputStyle = (name: string) =>
					plugin.pipe(
						Effect.map((loaded) =>
							Arr.findFirst(loaded.outputStyles, (entry) => entry.name === name)
						)
					);

				return Service.of({
					cwd: options.cwd,
					pluginRoot,
					mcpPath,
					settings,
					mcp,
					plugin,
					skill,
					command,
					agent,
					outputStyle,
					invalidate: {
						settings: invalidateSettings,
						mcp: invalidateMcp,
						plugin: invalidatePlugin,
						all: Effect.all([
							invalidateSettings,
							invalidateMcp,
							invalidatePlugin
						]).pipe(Effect.asVoid)
					}
				});
			})
		);
}
/* eslint-enable @typescript-eslint/no-namespace */

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Effectful access to the full project service.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const project: Effect.Effect<ClaudeProject.Interface, never, ClaudeProject.Service> =
	Effect.service(ClaudeProject.Service);

/**
 * Effectful access to the cached settings loader.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const settings = Effect.flatMap(project, (p) => p.settings);

/**
 * Effectful access to the cached optional MCP config.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const mcp = Effect.flatMap(project, (p) => p.mcp);

/**
 * Effectful access to the cached plugin definition.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const plugin = Effect.flatMap(project, (p) => p.plugin);
