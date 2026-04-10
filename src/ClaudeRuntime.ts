/**
 * Prewired ManagedRuntime for effect-claudecode programs.
 *
 * `ClaudeRuntime` bundles the platform services most library consumers
 * otherwise have to wire manually (`FileSystem`, `Path`, and logger
 * configuration) into a reusable `ManagedRuntime`. Callers may replace the
 * platform layer for tests and merge in additional services for their own
 * programs.
 *
 * @since 0.1.0
 */
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Path from 'effect/Path';

import * as ClaudeProject from './ClaudeProject.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The baseline services every default Claude runtime provides.
 *
 * @category Models
 * @since 0.1.0
 */
export type BaseServices = FileSystem.FileSystem | Path.Path;

/**
 * Logger presets for `ClaudeRuntime.layer` / `ClaudeRuntime.make`.
 *
 * @category Models
 * @since 0.1.0
 */
export type LoggerKind =
	| 'default'
	| 'pretty'
	| 'json'
	| 'logFmt'
	| 'structured'
	| 'none';

/**
 * Runtime construction options.
 *
 * `platformLayer` replaces the default Node-backed `FileSystem` / `Path`
 * layer, which is useful in tests. `layer` merges in additional services.
 *
 * @category Models
 * @since 0.1.0
 */
export interface RuntimeOptions<R = never, E = never, EP = never> {
	readonly platformLayer?: Layer.Layer<BaseServices, EP, never>;
	readonly layer?: Layer.Layer<R, E, never>;
	readonly logger?: LoggerKind;
	readonly mergeWithExistingLoggers?: boolean;
	readonly memoMap?: Layer.MemoMap;
}

/**
 * Runtime construction options for `ClaudeRuntime.project(...)`.
 *
 * Adds the cached `ClaudeProject` service for one concrete project root while
 * preserving the same platform / logger overrides as `ClaudeRuntime.make(...)`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface ProjectRuntimeOptions<R = never, E = never, EP = never>
	extends RuntimeOptions<R, E, EP> {
	readonly cwd: string;
	readonly pluginRoot?: string;
	readonly mcpPath?: string;
}

/**
 * Runtime construction options for `ClaudeRuntime.plugin(...)`.
 *
 * Like `ClaudeRuntime.project(...)`, but requires an explicit plugin root so
 * plugin scans and named component lookups resolve against the plugin
 * directory instead of the project root.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginRuntimeOptions<R = never, E = never, EP = never>
	extends RuntimeOptions<R, E, EP> {
	readonly cwd: string;
	readonly pluginRoot: string;
	readonly mcpPath?: string;
}

/**
 * Managed runtime returned by `ClaudeRuntime.make`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Runtime<R = never, E = never>
	extends ManagedRuntime.ManagedRuntime<BaseServices | R, E> {
	readonly layer: Layer.Layer<BaseServices | R, E, never>;
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * The default platform layer for effect-claudecode programs.
 *
 * @category Layers
 * @since 0.1.0
 */
export const baseLayer: Layer.Layer<BaseServices> = Layer.mergeAll(
	NodeFileSystem.layer,
	NodePath.layer
);

const loggerLayer = (
	kind: LoggerKind,
	mergeWithExistingLoggers: boolean
): Layer.Layer<never> => {
	if (kind === 'none') {
		return Layer.empty;
	}

	const logger =
		kind === 'json'
			? Logger.consoleJson
			: kind === 'logFmt'
				? Logger.consoleLogFmt
				: kind === 'structured'
					? Logger.consoleStructured
					: kind === 'pretty' || kind === 'default'
						? Logger.consolePretty()
						: Logger.consolePretty();

	return Logger.layer([Logger.tracerLogger, logger], {
		mergeWithExisting: mergeWithExistingLoggers
	});
};

/**
 * Build the full layer used by the shared runtime.
 *
 * @category Layers
 * @since 0.1.0
 */
export const layer = <R = never, E = never, EP = never>(
	options?: RuntimeOptions<R, E, EP>
): Layer.Layer<BaseServices | R, E | EP, never> => {
	const platformLayer = options?.platformLayer ?? baseLayer;
	const extraLayer = options?.layer ?? Layer.empty;
	return Layer.mergeAll(
		platformLayer,
		extraLayer,
		loggerLayer(
			options?.logger ?? 'default',
			options?.mergeWithExistingLoggers ?? false
		)
	);
};

const mergeExtraLayer = <R = never, E = never, EP = never>(options: {
	readonly projectLayer: Layer.Layer<ClaudeProject.ClaudeProject.Service, EP, never>;
	readonly extraLayer?: Layer.Layer<R, E, never>;
}): Layer.Layer<ClaudeProject.ClaudeProject.Service | R, E | EP, never> =>
	Layer.mergeAll(options.projectLayer, options.extraLayer ?? Layer.empty);

const projectRuntimeLayer = <R = never, E = never, EP = never>(
	options: ProjectRuntimeOptions<R, E, EP>
): Layer.Layer<BaseServices | ClaudeProject.ClaudeProject.Service | R, E | EP, never> =>
	(() => {
		const platformLayer = options.platformLayer ?? baseLayer;
		const projectOptions: ClaudeProject.ClaudeProjectOptions = {
			cwd: options.cwd,
			...(options.pluginRoot === undefined
				? {}
				: { pluginRoot: options.pluginRoot }),
			...(options.mcpPath === undefined ? {} : { mcpPath: options.mcpPath })
		};
		const runtimeOptions: RuntimeOptions<
			ClaudeProject.ClaudeProject.Service | R,
			E | EP,
			EP
		> = {
			platformLayer,
			layer: mergeExtraLayer({
				projectLayer: ClaudeProject.ClaudeProject.layer(projectOptions).pipe(
					Layer.provide(platformLayer)
				),
				...(options.layer === undefined
					? {}
					: { extraLayer: options.layer })
			}),
			...(options.logger === undefined ? {} : { logger: options.logger }),
			...(options.mergeWithExistingLoggers === undefined
				? {}
				: {
					mergeWithExistingLoggers:
						options.mergeWithExistingLoggers
				})
		};
		return layer({
			...runtimeOptions
		});
	})();

// ---------------------------------------------------------------------------
// Managed runtime constructors
// ---------------------------------------------------------------------------

const fromLayer = <R = never, E = never>(
	runtimeLayer: Layer.Layer<BaseServices | R, E, never>,
	memoMap?: Layer.MemoMap
): Runtime<R, E> => {
	const runtime = ManagedRuntime.make(runtimeLayer, { memoMap });
	return {
		...runtime,
		layer: runtimeLayer
	};
};

/**
 * Create a prewired `ManagedRuntime` for effect-claudecode programs.
 *
 * @category Runtime
 * @since 0.1.0
 */
export const make = <R = never, E = never, EP = never>(
	options?: RuntimeOptions<R, E, EP>
): Runtime<R, E | EP> =>
	fromLayer(layer(options), options?.memoMap);

/**
 * Alias for `make` that highlights the default setup.
 *
 * @category Runtime
 * @since 0.1.0
 */
export const defaultRuntime = <R = never, E = never, EP = never>(
	options?: RuntimeOptions<R, E, EP>
): Runtime<R, E | EP> => make(options);

/**
 * Create a prewired runtime that also includes the cached `ClaudeProject`
 * service for one project root.
 *
 * This is the recommended entry point for project-aware scripts that need
 * settings, `.mcp.json`, or plugin component lookups in addition to the base
 * platform services.
 *
 * @category Runtime
 * @since 0.1.0
 */
export const project = <R = never, E = never, EP = never>(
	options: ProjectRuntimeOptions<R, E, EP>
): Runtime<ClaudeProject.ClaudeProject.Service | R, E | EP> =>
	fromLayer(projectRuntimeLayer(options), options.memoMap);

/**
 * Create a prewired runtime for plugin-aware scripts.
 *
 * Compared with `ClaudeRuntime.project(...)`, this preset requires an explicit
 * `pluginRoot` so `ClaudeProject.plugin` and named component lookups read from
 * the plugin directory rather than the project root.
 *
 * @category Runtime
 * @since 0.1.0
 */
export const plugin = <R = never, E = never, EP = never>(
	options: PluginRuntimeOptions<R, E, EP>
): Runtime<ClaudeProject.ClaudeProject.Service | R, E | EP> =>
	project(options);

/**
 * Alias retained for ergonomic call sites: `ClaudeRuntime.default(...)`.
 *
 * @category Runtime
 * @since 0.1.0
 */
export { defaultRuntime as default };
