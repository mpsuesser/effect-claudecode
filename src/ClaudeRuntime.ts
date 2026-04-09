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
 * Managed runtime returned by `ClaudeRuntime.make`.
 *
 * @category Models
 * @since 0.1.0
 */
export type Runtime<R = never, E = never> = ManagedRuntime.ManagedRuntime<
	BaseServices | R,
	E
>;

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

// ---------------------------------------------------------------------------
// Managed runtime constructors
// ---------------------------------------------------------------------------

/**
 * Create a prewired `ManagedRuntime` for effect-claudecode programs.
 *
 * @category Runtime
 * @since 0.1.0
 */
export const make = <R = never, E = never, EP = never>(
	options?: RuntimeOptions<R, E, EP>
): Runtime<R, E | EP> =>
	ManagedRuntime.make(layer(options), { memoMap: options?.memoMap });

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
 * Alias retained for ergonomic call sites: `ClaudeRuntime.default(...)`.
 *
 * @category Runtime
 * @since 0.1.0
 */
export { defaultRuntime as default };
