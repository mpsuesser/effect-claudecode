#!/usr/bin/env bun
/**
 * Example: inspect Claude Code project state through the project runtime
 * preset.
 *
 * Demonstrates `ClaudeRuntime.project({ cwd })`, which wires the cached
 * `ClaudeProject` service into the runtime so scripts can compose cached
 * settings, optional `.mcp.json`, and named plugin lookups with
 * `Effect.all`, `Option.match`, and structured logs.
 *
 * Run from a repository that contains Claude Code config:
 *
 *     bun examples/project-runtime-summary.ts
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

import { ClaudeProject, ClaudeRuntime } from 'effect-claudecode';

const runtime = ClaudeRuntime.project({ cwd: process.cwd() });

const program = Effect.gen(function* () {
	const project = yield* ClaudeProject.project;
	const [settings, reviewSkill, mcp] = yield* Effect.all([
		project.settings,
		project.skill('review'),
		project.mcp
	]);

	yield* Effect.logInfo('project summary').pipe(
		Effect.annotateLogs({
			cwd: project.cwd,
			model: settings.model ?? 'unset',
			reviewSkill: Option.match(reviewSkill, {
				onNone: () => 'missing',
				onSome: (skill) => skill.path ?? 'present'
			}),
			mcp: Option.match(mcp, {
				onNone: () => 'missing',
				onSome: () => 'configured'
			})
		})
	);
}).pipe(Effect.withLogSpan('project.summary'));

await runtime.runPromise(program);
await runtime.dispose();
