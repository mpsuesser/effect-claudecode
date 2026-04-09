/**
 * Effect service carrying per-invocation hook context.
 *
 * Every hook handler has access to `HookContext.Service` via `yield*`
 * (or the individual accessor effects). The service is constructed by
 * the runner from the decoded envelope of the incoming stdin payload,
 * so handlers never touch the raw JSON.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as ServiceMap from 'effect/ServiceMap';

import type { HookEnvelope } from './Envelope.ts';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-namespace */
export namespace HookContext {
	/**
	 * The shape of the HookContext service — camelCase-normalized envelope
	 * fields plus any future per-invocation metadata.
	 *
	 * @category Service
	 * @since 0.1.0
	 */
	export interface Interface {
		readonly sessionId: string;
		readonly transcriptPath: string;
		readonly cwd: string;
		readonly permissionMode: string | undefined;
		readonly hookEventName: string;
	}

	/**
	 * The HookContext ServiceMap.Service tag.
	 *
	 * @category Service
	 * @since 0.1.0
	 */
	export class Service extends ServiceMap.Service<Service, Interface>()(
		'effect-claudecode/HookContext'
	) {}

	/**
	 * Build a `HookContext.Interface` value from a decoded `HookEnvelope`.
	 *
	 * @category Constructors
	 * @since 0.1.0
	 */
	export const fromEnvelope = (env: HookEnvelope): Interface => ({
		sessionId: env.session_id,
		transcriptPath: env.transcript_path,
		cwd: env.cwd,
		permissionMode: env.permission_mode,
		hookEventName: env.hook_event_name
	});

	/**
	 * Build a Layer that provides `HookContext.Service` from a decoded envelope.
	 *
	 * The runner calls this per-invocation with the parsed stdin envelope.
	 * Tests can call it with a mock envelope built via
	 * `Testing.makeMockHookContext`.
	 *
	 * @category Layers
	 * @since 0.1.0
	 */
	export const layer = (env: HookEnvelope): Layer.Layer<Service> =>
		Layer.succeed(Service, Service.of(fromEnvelope(env)));
}
/* eslint-enable @typescript-eslint/no-namespace */

// ---------------------------------------------------------------------------
// Convenience accessors (yield*-able inside handlers)
// ---------------------------------------------------------------------------

/**
 * Effectful access to the current session ID.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const sessionId: Effect.Effect<string, never, HookContext.Service> =
	Effect.service(HookContext.Service).pipe(Effect.map((c) => c.sessionId));

/**
 * Effectful access to the path of the conversation transcript file.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const transcriptPath: Effect.Effect<
	string,
	never,
	HookContext.Service
> = Effect.service(HookContext.Service).pipe(
	Effect.map((c) => c.transcriptPath)
);

/**
 * Effectful access to the working directory in which the hook fired.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const cwd: Effect.Effect<string, never, HookContext.Service> =
	Effect.service(HookContext.Service).pipe(Effect.map((c) => c.cwd));

/**
 * Effectful access to the active permission mode (if any).
 *
 * @category Accessors
 * @since 0.1.0
 */
export const permissionMode: Effect.Effect<
	string | undefined,
	never,
	HookContext.Service
> = Effect.service(HookContext.Service).pipe(
	Effect.map((c) => c.permissionMode)
);

/**
 * Effectful access to the hook event name (e.g. `"PreToolUse"`).
 *
 * @category Accessors
 * @since 0.1.0
 */
export const hookEventName: Effect.Effect<
	string,
	never,
	HookContext.Service
> = Effect.service(HookContext.Service).pipe(
	Effect.map((c) => c.hookEventName)
);
