/**
 * Focused tests for hook events added after the original event set:
 * Setup, UserPromptExpansion, PostToolBatch, and MessageDisplay.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import * as MessageDisplay from '../../../src/Hook/Events/MessageDisplay.ts';
import * as PostToolBatch from '../../../src/Hook/Events/PostToolBatch.ts';
import * as Setup from '../../../src/Hook/Events/Setup.ts';
import * as UserPromptExpansion from '../../../src/Hook/Events/UserPromptExpansion.ts';
import * as Testing from '../../../src/Testing.ts';

const envelope = {
	session_id: 'test-session',
	transcript_path: '/tmp/t.jsonl',
	cwd: '/tmp/ws',
	permission_mode: 'default'
} as const;

const encodeJson = Schema.encodeSync(Schema.UnknownFromJsonString);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('Hook.Setup', () => {
	it.effect('matches on trigger and injects setup context', () =>
		Effect.gen(function* () {
			const hook = Setup.onMatcher({
				matcher: 'init',
				handler: () => Effect.succeed(Setup.addContext('Initialize repo'))
			});
			const json = encodeJson({
				...envelope,
				hook_event_name: 'Setup',
				trigger: 'init'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					hookEventName: 'Setup',
					additionalContext: 'Initialize repo'
				}
			});
		})
	);

	it.effect('non-matching trigger is a no-op', () =>
		Effect.gen(function* () {
			const hook = Setup.onMatcher({
				matcher: 'maintenance',
				handler: () => Effect.succeed(Setup.addContext('Maintain'))
			});
			const json = encodeJson({
				...envelope,
				hook_event_name: 'Setup',
				trigger: 'init'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toEqual({});
		})
	);
});

// ---------------------------------------------------------------------------
// UserPromptExpansion
// ---------------------------------------------------------------------------

describe('Hook.UserPromptExpansion', () => {
	it.effect('blocks an expanded slash command', () =>
		Effect.gen(function* () {
			const hook = UserPromptExpansion.onMatcher({
				matcher: 'dangerous-command',
				handler: () =>
					Effect.succeed(
						UserPromptExpansion.block('Do not expand this command')
					)
			});
			const json = encodeJson({
				...envelope,
				hook_event_name: 'UserPromptExpansion',
				expansion_type: 'slash_command',
				command_name: 'dangerous-command',
				command_args: '--force',
				command_source: 'project',
				prompt: 'expanded prompt'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				decision: 'block',
				reason: 'Do not expand this command'
			});
		})
	);

	it('addContext produces the documented hookSpecificOutput shape', () => {
		const output = UserPromptExpansion.addContext('expanded with metadata');
		expect(output.hookSpecificOutput).toMatchObject({
			hookEventName: 'UserPromptExpansion',
			additionalContext: 'expanded with metadata'
		});
	});
});

// ---------------------------------------------------------------------------
// PostToolBatch
// ---------------------------------------------------------------------------

describe('Hook.PostToolBatch', () => {
	it.effect('decodes a parallel tool batch and adds context', () =>
		Effect.gen(function* () {
			const hook = PostToolBatch.define({
				handler: (input) =>
					Effect.succeed(
						PostToolBatch.addContext(
							`batch-size=${input.tool_calls.length}`
						)
					)
			});
			const json = encodeJson({
				...envelope,
				hook_event_name: 'PostToolBatch',
				tool_calls: [
					{
						tool_name: 'Read',
						tool_input: { file_path: '/tmp/a.ts' },
						tool_use_id: 'call-1',
						tool_response: { content: 'a' }
					},
					{
						tool_name: 'Glob',
						tool_input: { pattern: '*.ts' },
						tool_response: ['a.ts']
					}
				]
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					hookEventName: 'PostToolBatch',
					additionalContext: 'batch-size=2'
				}
			});
		})
	);

	it('block produces top-level decision feedback', () => {
		const output = PostToolBatch.block('tool batch invalid');
		expect(output.decision).toBe('block');
		expect(output.reason).toBe('tool batch invalid');
	});
});

// ---------------------------------------------------------------------------
// MessageDisplay
// ---------------------------------------------------------------------------

describe('Hook.MessageDisplay', () => {
	it.effect('decodes a message delta and replaces display content', () =>
		Effect.gen(function* () {
			const hook = MessageDisplay.define({
				handler: (input) =>
					Effect.succeed(
						MessageDisplay.display(`display:${input.delta}`)
					)
			});
			const json = encodeJson({
				...envelope,
				hook_event_name: 'MessageDisplay',
				turn_id: 'turn-1',
				message_id: 'message-1',
				index: 3,
				final: false,
				delta: 'hello'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					hookEventName: 'MessageDisplay',
					displayContent: 'display:hello'
				}
			});
		})
	);
});
