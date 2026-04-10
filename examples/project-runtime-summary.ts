#!/usr/bin/env bun
/**
 * Example: inspect Claude Code project state through the project runtime
 * preset.
 *
 * Demonstrates `ClaudeRuntime.project({ cwd })`, which wires the cached
 * `ClaudeProject` service into the runtime so scripts can read settings,
 * `.mcp.json`, and plugin components without manual layer composition.
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
	const settings = yield* project.settings;
	const reviewSkill = yield* project.skill('review');

	yield* Effect.logInfo('Project summary').pipe(
		Effect.annotateLogs({
			cwd: project.cwd,
			model: settings.model ?? 'unset',
			hasReviewSkill: Option.isSome(reviewSkill)
		})
	);
});

await runtime.runPromise(program);
await runtime.dispose();
