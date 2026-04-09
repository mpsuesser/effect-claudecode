/**
 * Round-trip + decision smoke tests for the 7 Tier-3 hook events.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';

import * as Elicitation from '../../../src/Hook/Events/Elicitation.ts';
import * as ElicitationResult from '../../../src/Hook/Events/ElicitationResult.ts';
import * as TaskCompleted from '../../../src/Hook/Events/TaskCompleted.ts';
import * as TaskCreated from '../../../src/Hook/Events/TaskCreated.ts';
import * as TeammateIdle from '../../../src/Hook/Events/TeammateIdle.ts';
import * as WorktreeCreate from '../../../src/Hook/Events/WorktreeCreate.ts';
import * as WorktreeRemove from '../../../src/Hook/Events/WorktreeRemove.ts';
import * as Testing from '../../../src/Testing.ts';

const base = {
	session_id: 'test-session',
	transcript_path: '/tmp/t.jsonl',
	cwd: '/tmp/ws'
} as const;

const baseWithMode = {
	...base,
	permission_mode: 'default'
} as const;

// ---------------------------------------------------------------------------
// TaskCreated / TaskCompleted
// ---------------------------------------------------------------------------

describe('Hook.TaskCreated', () => {
	it.effect('block() sets continue: false with a reason', () =>
		Effect.gen(function* () {
			const hook = TaskCreated.define({
				handler: () => Effect.succeed(TaskCreated.block('quota exceeded'))
			});
			const json = JSON.stringify({
				...baseWithMode,
				hook_event_name: 'TaskCreated',
				task_id: 't-1',
				task_subject: 'Write tests'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				continue: false,
				stopReason: 'quota exceeded'
			});
		})
	);
});

describe('Hook.TaskCompleted', () => {
	it.effect('decodes envelope and passes through', () =>
		Effect.gen(function* () {
			const hook = TaskCompleted.define({
				handler: () => Effect.succeed(TaskCompleted.allow())
			});
			const json = JSON.stringify({
				...baseWithMode,
				hook_event_name: 'TaskCompleted',
				task_id: 't-2',
				task_subject: 'Deploy',
				teammate_name: 'Alice'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// TeammateIdle
// ---------------------------------------------------------------------------

describe('Hook.TeammateIdle', () => {
	it.effect('keepWorking prevents idle', () =>
		Effect.gen(function* () {
			const hook = TeammateIdle.define({
				handler: () =>
					Effect.succeed(TeammateIdle.keepWorking('still tasks queued'))
			});
			const json = JSON.stringify({
				...baseWithMode,
				hook_event_name: 'TeammateIdle',
				team_name: 'frontend',
				teammate_name: 'Bob'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({ continue: false });
		})
	);
});

// ---------------------------------------------------------------------------
// WorktreeCreate / WorktreeRemove
// ---------------------------------------------------------------------------

describe('Hook.WorktreeCreate', () => {
	it.effect('created() returns a worktree path in hookSpecificOutput', () =>
		Effect.gen(function* () {
			const hook = WorktreeCreate.define({
				handler: () => Effect.succeed(WorktreeCreate.created('/tmp/wt-1'))
			});
			const json = JSON.stringify({
				...base,
				hook_event_name: 'WorktreeCreate',
				worktree_path: '/tmp/wt-1',
				git_repo_path: '/tmp/repo'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					hookEventName: 'WorktreeCreate',
					worktreePath: '/tmp/wt-1'
				}
			});
		})
	);
});

describe('Hook.WorktreeRemove', () => {
	it.effect('decodes and passes through', () =>
		Effect.gen(function* () {
			const hook = WorktreeRemove.define({
				handler: () => Effect.succeed(WorktreeRemove.passthrough())
			});
			const json = JSON.stringify({
				...base,
				hook_event_name: 'WorktreeRemove',
				worktree_path: '/tmp/wt-1'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
		})
	);
});

// ---------------------------------------------------------------------------
// Elicitation / ElicitationResult
// ---------------------------------------------------------------------------

describe('Hook.Elicitation', () => {
	it.effect('accept() with content', () =>
		Effect.gen(function* () {
			const hook = Elicitation.define({
				handler: () =>
					Effect.succeed(
						Elicitation.accept({ username: 'alice' })
					)
			});
			const json = JSON.stringify({
				...baseWithMode,
				hook_event_name: 'Elicitation',
				mcp_server_name: 'memory'
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: {
					action: 'accept',
					content: { username: 'alice' }
				}
			});
		})
	);

	it('decline() sets action to decline', () => {
		const out = Elicitation.decline();
		expect(out.hookSpecificOutput?.action).toBe('decline');
	});
});

describe('Hook.ElicitationResult', () => {
	it.effect('accept overrides user response', () =>
		Effect.gen(function* () {
			const hook = ElicitationResult.define({
				handler: () =>
					Effect.succeed(
						ElicitationResult.accept({ override: true })
					)
			});
			const json = JSON.stringify({
				...baseWithMode,
				hook_event_name: 'ElicitationResult',
				mcp_server_name: 'memory',
				user_response: { choice: 'yes' }
			});
			const result = yield* Testing.runHookWithMockStdin(hook, json);
			expect(result.exitCode).toBe(0);
			expect(result.output).toMatchObject({
				hookSpecificOutput: { action: 'accept', content: { override: true } }
			});
		})
	);
});
