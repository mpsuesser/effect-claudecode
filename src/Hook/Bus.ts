/**
 * Typed in-process event bus for hook invocations.
 *
 * Built on `PubSub` + `Stream.fromPubSub`, this lets consumers build reactive
 * pipelines over decoded hook events without inventing their own subscription
 * plumbing.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as PubSub from 'effect/PubSub';
import * as ServiceMap from 'effect/ServiceMap';
import * as Stream from 'effect/Stream';

import type * as Events from './Events/index.ts';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-namespace */
export namespace HookBus {
	/**
	 * The hook bus service interface.
	 *
	 * @category Service
	 * @since 0.1.0
	 */
	export interface Interface {
		readonly publish: (event: Events.HookInput) => Effect.Effect<void>;
		readonly events: Stream.Stream<Events.HookInput>;
		readonly stream: <T extends Events.HookEventName>(
			eventName: T
		) => Stream.Stream<Extract<Events.HookInput, { readonly hook_event_name: T }>>;
	}

	/**
	 * The hook bus service tag.
	 *
	 * @category Service
	 * @since 0.1.0
	 */
	export class Service extends ServiceMap.Service<Service, Interface>()(
		'effect-claudecode/HookBus'
	) {}

	/**
	 * Construct an in-process hook bus layer.
	 *
	 * @category Layers
	 * @since 0.1.0
	 */
	export const layer = Layer.effect(
		Service,
		Effect.gen(function* () {
			const pubsub = yield* PubSub.unbounded<Events.HookInput>();
			yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

			const events = Stream.fromPubSub(pubsub);
			const publish = (event: Events.HookInput) => PubSub.publish(pubsub, event);
			const stream = <T extends Events.HookEventName>(eventName: T) =>
				events.pipe(
					Stream.filter(
						(event): event is Extract<Events.HookInput, { readonly hook_event_name: T }> =>
							event.hook_event_name === eventName
					)
				);

			return Service.of({ publish, events, stream });
		})
	);
}
/* eslint-enable @typescript-eslint/no-namespace */

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Effectful access to the hook bus service.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const bus: Effect.Effect<HookBus.Interface, never, HookBus.Service> =
	Effect.service(HookBus.Service);

/**
 * Publish one hook event to the current bus.
 *
 * @category Accessors
 * @since 0.1.0
 */
export const publish = (event: Events.HookInput): Effect.Effect<void, never, HookBus.Service> =>
	Effect.flatMap(bus, (hookBus) => hookBus.publish(event));
