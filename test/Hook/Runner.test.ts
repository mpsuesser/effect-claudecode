/**
 * Tests for the Hook runner — the stdio FFI boundary that decodes hook
 * input, runs a handler, encodes the output, and maps failures to exit codes.
 *
 * Uses a synthetic "TestEvent" schema so Phase 2 can verify the runner
 * before any real event schemas land in Phase 3.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { HookContext } from '../../src/Hook/Context.ts';
import { envelopeFields } from '../../src/Hook/Envelope.ts';
import type { HookDefinition } from '../../src/Hook/Runner.ts';
import * as Testing from '../../src/Testing.ts';

// ---------------------------------------------------------------------------
// Synthetic test event + error
// ---------------------------------------------------------------------------

class TestInput extends Schema.Class<TestInput>('TestInput')({
	...envelopeFields,
	hook_event_name: Schema.Literal('TestEvent'),
	value: Schema.Number
}) {}

class TestOutput extends Schema.Class<TestOutput>('TestOutput')({
	echoed: Schema.Number,
	sessionId: Schema.String
}) {}

class TestFailure extends Schema.TaggedErrorClass<TestFailure>(
	'TestFailure'
)('TestFailure', {
	message: Schema.String
}) {}

const makeTestHook = (
	handler: (
		input: TestInput
	) => Effect.Effect<TestOutput, unknown, HookContext.Service>
): HookDefinition<TestInput, TestOutput> => ({
	event: 'TestEvent',
	inputSchema: TestInput,
	outputSchema: TestOutput,
	handler
});

const validInput = JSON.stringify({
	session_id: 'session-42',
	transcript_path: '/tmp/t.jsonl',
	cwd: '/tmp/ws',
	hook_event_name: 'TestEvent',
	permission_mode: 'default',
	value: 21
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('Hook.runHookProgram', () => {
	it.effect('decodes input, runs handler, encodes output, exit 0', () =>
		Effect.gen(function* () {
			const hook = makeTestHook((input) =>
				Effect.gen(function* () {
					const ctx = yield* HookContext.Service;
					return new TestOutput({
						echoed: input.value * 2,
						sessionId: ctx.sessionId
					});
				})
			);

			const result = yield* Testing.runHookWithMockStdin(hook, validInput);

			expect(result.exitCode).toBe(0);
			expect(result.errorTag).toBeUndefined();
			expect(result.output).toEqual({
				echoed: 42,
				sessionId: 'session-42'
			});
		})
	);

	// ---------------------------------------------------------------------------
	// Error paths
	// ---------------------------------------------------------------------------

	it.effect(
		'malformed JSON → HookInputDecodeError (phase=json), exit 2',
		() =>
			Effect.gen(function* () {
				const hook = makeTestHook((input) =>
					Effect.succeed(
						new TestOutput({ echoed: input.value, sessionId: 'x' })
					)
				);

				const result = yield* Testing.runHookWithMockStdin(
					hook,
					'this is not json'
				);

				expect(result.exitCode).toBe(2);
				expect(result.errorTag).toBe('HookInputDecodeError');
			})
	);

	it.effect(
		'invalid schema → HookInputDecodeError (phase=schema), exit 2',
		() =>
			Effect.gen(function* () {
				const hook = makeTestHook((input) =>
					Effect.succeed(
						new TestOutput({ echoed: input.value, sessionId: 'x' })
					)
				);

				const badInput = JSON.stringify({
					session_id: 'x',
					transcript_path: '/tmp/t',
					cwd: '/tmp',
					hook_event_name: 'TestEvent'
					// missing: value
				});

				const result = yield* Testing.runHookWithMockStdin(hook, badInput);

				expect(result.exitCode).toBe(2);
				expect(result.errorTag).toBe('HookInputDecodeError');
			})
	);

	it.effect('handler failure → HookHandlerError, exit 1', () =>
		Effect.gen(function* () {
			const hook = makeTestHook(() =>
				Effect.fail(new TestFailure({ message: 'kaboom' }))
			);

			const result = yield* Testing.runHookWithMockStdin(hook, validInput);

			expect(result.exitCode).toBe(1);
			expect(result.errorTag).toBe('HookHandlerError');
		})
	);
});

// ---------------------------------------------------------------------------
// HookContext provision
// ---------------------------------------------------------------------------

describe('HookContext', () => {
	it.effect('envelope fields are projected into HookContext', () =>
		Effect.gen(function* () {
			const hook = makeTestHook((input) =>
				Effect.gen(function* () {
					const ctx = yield* HookContext.Service;
					return new TestOutput({
						echoed: input.value,
						sessionId: ctx.sessionId
					});
				})
			);

			const result = yield* Testing.runHookWithMockStdin(hook, validInput);

			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({ sessionId: 'session-42' });
		})
	);
});
