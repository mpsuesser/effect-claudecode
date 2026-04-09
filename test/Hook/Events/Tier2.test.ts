/**
 * Round-trip + decision smoke tests for the 10 Tier-2 hook events.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';

import * as ConfigChange from '../../../src/Hook/Events/ConfigChange.ts';
import * as CwdChanged from '../../../src/Hook/Events/CwdChanged.ts';
import * as FileChanged from '../../../src/Hook/Events/FileChanged.ts';
import * as InstructionsLoaded from '../../../src/Hook/Events/InstructionsLoaded.ts';
import * as PermissionDenied from '../../../src/Hook/Events/PermissionDenied.ts';
import * as PermissionRequest from '../../../src/Hook/Events/PermissionRequest.ts';
import * as PostCompact from '../../../src/Hook/Events/PostCompact.ts';
import * as PostToolUseFailure from '../../../src/Hook/Events/PostToolUseFailure.ts';
import * as StopFailure from '../../../src/Hook/Events/StopFailure.ts';
import * as SubagentStart from '../../../src/Hook/Events/SubagentStart.ts';
import * as Testing from '../../../src/Testing.ts';

const baseEnvelope = {
	session_id: 'test-session',
	transcript_path: '/tmp/t.jsonl',
	cwd: '/tmp/ws'
} as const;

const envelopeWithMode = {
	...baseEnvelope,
	permission_mode: 'default'
} as const;

// ---------------------------------------------------------------------------
// PostCompact
// ---------------------------------------------------------------------------

describe('Hook.PostCompact', () => {
	it.effect('decodes via runner', () =>
		Effect.gen(function* () {
			const hook = PostCompact.define({
				handler: () => Effect.succeed(PostCompact.passthrough())
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'PostCompact',
				trigger: 'auto'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// PermissionRequest
// ---------------------------------------------------------------------------

describe('Hook.PermissionRequest', () => {
	it.effect('decodes via runner and allows with rule update', () =>
		Effect.gen(function* () {
			const hook = PermissionRequest.define({
				handler: () =>
					Effect.succeed(
						PermissionRequest.allow({
							updatedInput: { command: 'git status' }
						})
					)
			});
			const json = JSON.stringify({
				...envelopeWithMode,
				hook_event_name: 'PermissionRequest',
				tool_name: 'Bash',
				tool_input: { command: 'git status' }
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					hookEventName: 'PermissionRequest',
					decision: { behavior: 'allow' }
				}
			});
		})
	);

	it('deny() includes a message', () => {
		const out = PermissionRequest.deny('unsafe path');
		expect(out.hookSpecificOutput?.decision.behavior).toBe('deny');
		expect(out.hookSpecificOutput?.decision.message).toBe('unsafe path');
	});
});

// ---------------------------------------------------------------------------
// PermissionDenied
// ---------------------------------------------------------------------------

describe('Hook.PermissionDenied', () => {
	it.effect('retry() signals model may try again', () =>
		Effect.gen(function* () {
			const hook = PermissionDenied.define({
				handler: () => Effect.succeed(PermissionDenied.retry())
			});
			const json = JSON.stringify({
				...envelopeWithMode,
				hook_event_name: 'PermissionDenied',
				tool_name: 'Bash',
				tool_input: { command: 'rm file' },
				reason: 'auto-classifier blocked'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: { retry: true }
			});
		})
	);
});

// ---------------------------------------------------------------------------
// PostToolUseFailure
// ---------------------------------------------------------------------------

describe('Hook.PostToolUseFailure', () => {
	it.effect('addContext attaches context to a failed tool call', () =>
		Effect.gen(function* () {
			const hook = PostToolUseFailure.define({
				handler: () =>
					Effect.succeed(PostToolUseFailure.addContext('Try again'))
			});
			const json = JSON.stringify({
				...envelopeWithMode,
				hook_event_name: 'PostToolUseFailure',
				tool_name: 'Bash',
				tool_input: { command: 'false' },
				error: 'non-zero exit'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: { additionalContext: 'Try again' }
			});
		})
	);
});

// ---------------------------------------------------------------------------
// SubagentStart
// ---------------------------------------------------------------------------

describe('Hook.SubagentStart', () => {
	it.effect('addContext injects context for the subagent', () =>
		Effect.gen(function* () {
			const hook = SubagentStart.define({
				handler: () =>
					Effect.succeed(
						SubagentStart.addContext('preloaded state')
					)
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'SubagentStart',
				agent_id: 'a-1',
				agent_type: 'Explore'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// ConfigChange
// ---------------------------------------------------------------------------

describe('Hook.ConfigChange', () => {
	it.effect('block() prevents a config change', () =>
		Effect.gen(function* () {
			const hook = ConfigChange.define({
				handler: () => Effect.succeed(ConfigChange.block('locked'))
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'ConfigChange',
				config_source: 'project_settings'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				decision: 'block',
				reason: 'locked'
			});
		})
	);
});

// ---------------------------------------------------------------------------
// InstructionsLoaded
// ---------------------------------------------------------------------------

describe('Hook.InstructionsLoaded', () => {
	it.effect('decodes a full nested-traversal payload', () =>
		Effect.gen(function* () {
			const hook = InstructionsLoaded.define({
				handler: () => Effect.succeed(InstructionsLoaded.passthrough())
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'InstructionsLoaded',
				file_path: '/repo/sub/CLAUDE.md',
				memory_type: 'Nested',
				load_reason: 'nested_traversal'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// StopFailure
// ---------------------------------------------------------------------------

describe('Hook.StopFailure', () => {
	it.effect('decodes rate_limit error type', () =>
		Effect.gen(function* () {
			const hook = StopFailure.define({
				handler: () => Effect.succeed(StopFailure.passthrough())
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'StopFailure',
				error_type: 'rate_limit'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// CwdChanged
// ---------------------------------------------------------------------------

describe('Hook.CwdChanged', () => {
	it.effect('decodes envelope-only payload', () =>
		Effect.gen(function* () {
			const hook = CwdChanged.define({
				handler: () => Effect.succeed(CwdChanged.passthrough())
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'CwdChanged'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// FileChanged
// ---------------------------------------------------------------------------

describe('Hook.FileChanged', () => {
	it.effect('decodes file modification event', () =>
		Effect.gen(function* () {
			const hook = FileChanged.define({
				handler: () => Effect.succeed(FileChanged.passthrough())
			});
			const json = JSON.stringify({
				...baseEnvelope,
				hook_event_name: 'FileChanged',
				file_path: '/repo/.env',
				change_type: 'modified'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});
