/**
 * Tests for the Testing module helpers — fixtures, assertion
 * helpers, and `makeMockFileSystem`.
 *
 * Fixtures are validated by decoding each one's JSON output
 * against the corresponding event `Input` schema. Assertion
 * helpers are validated by feeding them the exact outputs
 * produced by each event's decision constructor. The mock
 * filesystem is validated by reading a few files and asserting
 * both the happy and not-found paths.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Order from 'effect/Order';
import * as Schema from 'effect/Schema';

import * as Hook from '../src/Hook.ts';
import * as Events from '../src/Hook/Events/index.ts';
import * as Testing from '../src/Testing.ts';

// ---------------------------------------------------------------------------
// fixtures — decode each fixture against its event schema
// ---------------------------------------------------------------------------

describe('Testing.fixtures', () => {
	it.effect('PreToolUse fixture decodes against the schema', () =>
		Effect.gen(function* () {
			const json = Testing.fixtures.PreToolUse({
				tool_name: 'Bash',
				tool_input: { command: 'ls' }
			});
			const parsed = Schema.decodeUnknownSync(
				Schema.UnknownFromJsonString
			)(json);
			const input = yield* Schema.decodeUnknownEffect(
				Events.PreToolUse.Input
			)(parsed);
			expect(input).toMatchObject({
				hook_event_name: 'PreToolUse',
				tool_name: 'Bash',
				tool_input: { command: 'ls' }
			});
		})
	);

	it.effect('UserPromptSubmit fixture decodes with prompt override', () =>
		Effect.gen(function* () {
			const json = Testing.fixtures.UserPromptSubmit({
				prompt: 'Hello, Claude'
			});
			const parsed = Schema.decodeUnknownSync(
				Schema.UnknownFromJsonString
			)(json);
			const input = yield* Schema.decodeUnknownEffect(
				Events.UserPromptSubmit.Input
			)(parsed);
			expect(input.prompt).toBe('Hello, Claude');
		})
	);

	it.effect('SessionStart fixture accepts `source` override', () =>
		Effect.gen(function* () {
			const json = Testing.fixtures.SessionStart({
				source: 'resume',
				model: 'claude-opus-4-6'
			});
			const parsed = Schema.decodeUnknownSync(
				Schema.UnknownFromJsonString
			)(json);
			const input = yield* Schema.decodeUnknownEffect(
				Events.SessionStart.Input
			)(parsed);
			expect(input).toMatchObject({
				source: 'resume',
				model: 'claude-opus-4-6'
			});
		})
	);

	it.effect('envelope fields are filled in with defaults', () =>
		Effect.gen(function* () {
			const json = Testing.fixtures.CwdChanged();
			const parsed = Schema.decodeUnknownSync(
				Schema.UnknownFromJsonString
			)(json);
			const input = yield* Schema.decodeUnknownEffect(
				Events.CwdChanged.Input
			)(parsed);
			expect(input).toMatchObject({
				session_id: 'test-session',
				transcript_path: '/tmp/transcript.jsonl',
				cwd: '/tmp/workspace',
				hook_event_name: 'CwdChanged'
			});
		})
	);

	it.effect('overrides replace the per-event defaults', () =>
		Effect.gen(function* () {
			const json = Testing.fixtures.FileChanged({
				file_path: '/other/path.ts',
				change_type: 'deleted'
			});
			const parsed = Schema.decodeUnknownSync(
				Schema.UnknownFromJsonString
			)(json);
			const input = yield* Schema.decodeUnknownEffect(
				Events.FileChanged.Input
			)(parsed);
			expect(input).toMatchObject({
				file_path: '/other/path.ts',
				change_type: 'deleted'
			});
		})
	);

	it('every event has a corresponding fixture entry', () => {
		const expectedKeys = Arr.sort(
			[
				'PreToolUse',
				'PostToolUse',
				'UserPromptSubmit',
				'Notification',
				'Stop',
				'SubagentStop',
				'SessionStart',
				'SessionEnd',
				'PreCompact',
				'PostCompact',
				'PermissionRequest',
				'PermissionDenied',
				'PostToolUseFailure',
				'InstructionsLoaded',
				'StopFailure',
				'CwdChanged',
				'FileChanged',
				'ConfigChange',
				'SubagentStart',
				'TaskCreated',
				'TaskCompleted',
				'TeammateIdle',
				'WorktreeCreate',
				'WorktreeRemove',
				'Elicitation',
				'ElicitationResult'
			],
			Order.String
		);
		const actualKeys = Arr.sort(
			Object.keys(Testing.fixtures),
			Order.String
		);
		expect(actualKeys).toEqual(expectedKeys);
		const allFunctions = Object.values(Testing.fixtures).every(
			(value) => typeof value === 'function'
		);
		expect(allFunctions).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Decision assertion helpers — feed them the outputs from decision
// constructors so we're testing round-trip compatibility.
// ---------------------------------------------------------------------------

describe('Testing.expect*Decision', () => {
	it('expectAllowDecision matches PreToolUse.allow output', () => {
		Testing.expectAllowDecision(Hook.PreToolUse.allow());
		Testing.expectAllowDecision(
			Hook.PreToolUse.allow('because reasons'),
			'because reasons'
		);
	});

	it('expectDenyDecision matches PreToolUse.deny output', () => {
		Testing.expectDenyDecision(
			Hook.PreToolUse.deny('destructive'),
			'destructive'
		);
	});

	it('expectAskDecision matches PreToolUse.ask output', () => {
		Testing.expectAskDecision(Hook.PreToolUse.ask('needs review'), 'needs review');
	});

	it('expectBlockDecision matches UserPromptSubmit.block output', () => {
		Testing.expectBlockDecision(
			Hook.UserPromptSubmit.block('off-topic'),
			'off-topic'
		);
	});

	it('expectBlockDecision also matches PostToolUse.block output', () => {
		Testing.expectBlockDecision(
			Hook.PostToolUse.block('tool output invalid'),
			'tool output invalid'
		);
	});

	it('expectAddContext matches UserPromptSubmit.addContext output', () => {
		Testing.expectAddContext(
			Hook.UserPromptSubmit.addContext('extra context'),
			'extra context'
		);
	});

	it('expectAddContext without a context arg only checks presence', () => {
		Testing.expectAddContext(
			Hook.PostToolUse.addContext('any value')
		);
	});
});

// ---------------------------------------------------------------------------
// makeMockFileSystem
// ---------------------------------------------------------------------------

describe('Testing.makeMockFileSystem', () => {
	it.effect('reads known files and reports not-found for unknown paths', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;

			const existingContent = yield* fs.readFileString('/a.txt');
			expect(existingContent).toBe('A');

			const existsA = yield* fs.exists('/a.txt');
			expect(existsA).toBe(true);

			const existsMissing = yield* fs.exists('/missing.txt');
			expect(existsMissing).toBe(false);

			// Reading a missing file surfaces a typed PlatformError
			const exit = yield* Effect.exit(fs.readFileString('/missing.txt'));
			expect(exit._tag).toBe('Failure');
		}).pipe(
			Effect.provide(
				Testing.makeMockFileSystem({
					'/a.txt': 'A',
					'/b.txt': 'B'
				})
			)
		)
	);

	it.effect('accepts a ReadonlyMap as well as a plain record', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const content = yield* fs.readFileString('/x');
			expect(content).toBe('X');
		}).pipe(
			Effect.provide(
				Testing.makeMockFileSystem(new Map([['/x', 'X']]))
			)
		)
	);
});

// ---------------------------------------------------------------------------
// Round-trip — feed a fixture through runHookWithMockStdin
// ---------------------------------------------------------------------------

describe('Testing.fixtures + runHookWithMockStdin integration', () => {
	it.effect(
		'a fixture wired through runHookWithMockStdin produces the expected decision',
		() =>
			Effect.gen(function* () {
				const hook = Hook.PreToolUse.define({
					handler: (input) =>
						Effect.succeed(
							input.tool_name === 'Bash'
								? Hook.PreToolUse.deny('no bash')
								: Hook.PreToolUse.allow()
						)
				});

				const result = yield* Testing.runHookWithMockStdin(
					hook,
					Testing.fixtures.PreToolUse({
						tool_name: 'Bash',
						tool_input: { command: 'rm -rf /' }
					})
				);

				expect(result.exitCode).toBe(0);
				Testing.expectDenyDecision(result.output, 'no bash');
			})
	);
});
