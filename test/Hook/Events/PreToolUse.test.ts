/**
 * Tests for the PreToolUse hook event.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as P from 'effect/Predicate';
import * as Schema from 'effect/Schema';

import { HookContext } from '../../../src/Hook/Context.ts';
import * as PreToolUse from '../../../src/Hook/Events/PreToolUse.ts';
import * as Testing from '../../../src/Testing.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface InputOverrides {
	readonly tool_name?: string;
	readonly tool_input?: Readonly<Record<string, unknown>>;
}

const makeInputJson = (overrides?: InputOverrides): string =>
	JSON.stringify({
		session_id: 'test-session',
		transcript_path: '/tmp/t.jsonl',
		cwd: '/tmp/ws',
		hook_event_name: 'PreToolUse',
		permission_mode: 'default',
		tool_name: overrides?.tool_name ?? 'Bash',
		tool_input: overrides?.tool_input ?? { command: 'ls' },
		tool_use_id: 'call-1'
	});

const decodeFromJson = Schema.decodeUnknownSync(
	Schema.fromJsonString(PreToolUse.Input)
);

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('Hook.PreToolUse schema', () => {
	it('decodes a well-formed JSON input', () => {
		const input = decodeFromJson(makeInputJson());
		expect(input.tool_name).toBe('Bash');
		expect(input.hook_event_name).toBe('PreToolUse');
	});

	it('rejects input missing tool_name', () => {
		const badJson = JSON.stringify({
			session_id: 'x',
			transcript_path: '/tmp/t',
			cwd: '/tmp',
			hook_event_name: 'PreToolUse',
			tool_input: { command: 'ls' }
		});
		expect(() => decodeFromJson(badJson)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

describe('Hook.PreToolUse decisions', () => {
	it('allow() produces permissionDecision=allow', () => {
		const out = PreToolUse.allow();
		expect(out.hookSpecificOutput?.permissionDecision).toBe('allow');
	});

	it('deny(reason) includes the reason', () => {
		const out = PreToolUse.deny('no raw SQL');
		expect(out.hookSpecificOutput?.permissionDecision).toBe('deny');
		expect(out.hookSpecificOutput?.permissionDecisionReason).toBe(
			'no raw SQL'
		);
	});

	it('ask() and defer() produce their respective decisions', () => {
		expect(PreToolUse.ask().hookSpecificOutput?.permissionDecision).toBe(
			'ask'
		);
		expect(
			PreToolUse.defer().hookSpecificOutput?.permissionDecision
		).toBe('defer');
	});

	it('allowWithUpdatedInput rewrites the tool input', () => {
		const out = PreToolUse.allowWithUpdatedInput(
			{ command: 'ls -la' },
			'normalized'
		);
		expect(out.hookSpecificOutput?.updatedInput).toEqual({
			command: 'ls -la'
		});
		expect(out.hookSpecificOutput?.permissionDecisionReason).toBe(
			'normalized'
		);
	});
});

// ---------------------------------------------------------------------------
// End-to-end via runner
// ---------------------------------------------------------------------------

describe('Hook.PreToolUse runner', () => {
	it.effect('denies rm -rf / and returns a parseable decision', () =>
		Effect.gen(function* () {
			const hook = PreToolUse.define({
				handler: (input) => {
					const command = input.tool_input['command'];
					const cmd = P.isString(command) ? command : '';
					return Effect.succeed(
						cmd.includes('rm -rf /')
							? PreToolUse.deny('destructive command')
							: PreToolUse.allow()
					);
				}
			});

			const result = yield* Testing.runHookWithMockStdin(
				hook,
				makeInputJson({
					tool_name: 'Bash',
					tool_input: { command: 'rm -rf /' }
				})
			);

			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					permissionDecision: 'deny',
					permissionDecisionReason: 'destructive command'
				}
			});
		})
	);

	it.effect('allows benign commands and reads HookContext', () =>
		Effect.gen(function* () {
			const hook = PreToolUse.define({
				handler: () =>
					Effect.gen(function* () {
						const ctx = yield* HookContext.Service;
						expect(ctx.sessionId).toBe('test-session');
						return PreToolUse.allow();
					})
			});

			const result = yield* Testing.runHookWithMockStdin(
				hook,
				makeInputJson()
			);

			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: { permissionDecision: 'allow' }
			});
		})
	);
});
