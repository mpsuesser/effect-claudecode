#!/usr/bin/env bun
/**
 * Example: build a complete Claude Code plugin in one script.
 *
 * Demonstrates `Plugin.define` → `Plugin.validate` → `Plugin.write` →
 * `Plugin.doctor` as a single pipeline. The plugin it produces is a
 * fully-functional code review toolkit with slash commands, a subagent,
 * a skill, an output style, hooks configuration (wiring in the loop
 * detector), and MCP server config.
 *
 * Run:
 *
 *     bun examples/plugin-factory.ts [output-dir]
 *
 * Result:
 *
 *     output-dir/
 *         .claude-plugin/plugin.json
 *         commands/review.md
 *         commands/summarize.md
 *         agents/reviewer.md
 *         skills/effect-patterns/SKILL.md
 *         output-styles/dense-review.md
 *         hooks/hooks.json
 *         .mcp.json
 *
 * Install the plugin by adding the output directory to your
 * `.claude/settings.json` under `projects.allowed_plugins`.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';

import { ClaudeRuntime, Plugin } from 'effect-claudecode';

const plugin = Plugin.define({
	manifest: {
		name: 'review-toolkit',
		version: '1.0.0',
		description:
			'Opinionated code review defaults — slash commands, a reviewer agent, Effect-aware skill, and loop detection hooks.',
		author: new Plugin.AuthorInfo({ name: 'Your Team' }),
		keywords: ['review', 'effect', 'claude-code']
	},

	commands: [
		Plugin.command({
			name: 'review',
			description: 'Review staged changes against project conventions',
			body: [
				'# /review',
				'',
				'Review the staged changes. For each file:',
				'',
				'1. Identify bugs, behavioral regressions, and missing edge cases.',
				'2. Flag test gaps — if a behavior changed, a test should have changed.',
				'3. Note any convention drift from surrounding code.',
				'',
				'Lead with concrete findings. Skip praise and filler.'
			].join('\n')
		}),
		Plugin.command({
			name: 'summarize',
			description: 'Summarize recent work for a PR description',
			body: [
				'# /summarize',
				'',
				'Read the git log and diff for the current branch.',
				'Produce a PR description with:',
				'',
				'- A one-line title (imperative mood, under 70 chars)',
				'- A summary section with 2-4 bullet points',
				'- A test plan checklist'
			].join('\n')
		})
	],

	agents: [
		Plugin.agent({
			name: 'reviewer',
			description:
				'Autonomous code review agent that investigates risky changes',
			body: [
				'# Reviewer Agent',
				'',
				'You are a code reviewer focused on correctness, not style.',
				'',
				'For each change:',
				'- Read the diff and the surrounding context.',
				'- Identify logic errors, race conditions, and missing error handling.',
				'- Check that tests cover the new behavior.',
				'- Summarize findings as a numbered list, most critical first.'
			].join('\n')
		})
	],

	skills: [
		Plugin.skill({
			name: 'effect-patterns',
			description:
				'Guide Claude toward idiomatic Effect v4 patterns when writing TypeScript',
			body: [
				'# Effect Patterns',
				'',
				'When writing Effect code:',
				'',
				'- Use `Schema.TaggedErrorClass` for domain errors with a `message` field.',
				'- Prefer `Option` for absence over `null`/`undefined`.',
				'- Decode at boundaries with `Schema.decodeUnknown*`, not deep in domain logic.',
				'- Use `Effect.gen` generators — avoid long `.pipe` chains for sequential logic.',
				'- Name spans with `Effect.fn("Module.method")` so traces are readable.'
			].join('\n')
		})
	],

	outputStyles: [
		Plugin.outputStyle({
			name: 'dense-review',
			description:
				'Compact review output — findings first, no filler, minimal markdown',
			body: [
				'# Dense Review',
				'',
				'Start with the most important finding. Use numbered lists.',
				'Skip "looks good" commentary. If nothing is wrong, say so in one line.',
				'Keep supporting detail to one sentence per finding.'
			].join('\n')
		})
	],

	hooksConfig: {
		PostToolUse: [
			{
				hooks: [
					{
						type: 'command',
						command:
							'bun ${CLAUDE_PLUGIN_ROOT}/hooks/loop-detector.ts'
					}
				]
			}
		]
	},

	mcpConfig: {
		mcpServers: {
			'session-logs': {
				type: 'stdio',
				command: 'mcp-filesystem',
				args: ['--root', '/tmp']
			}
		}
	}
});

const outputDir = process.argv[2] ?? 'artifacts/review-toolkit';

const program = Plugin.validate(plugin).pipe(
	Effect.flatMap(() => Plugin.write(plugin, outputDir)),
	Effect.flatMap(() => Plugin.doctor(outputDir)),
	Effect.tap((report) =>
		Effect.logInfo('plugin materialized').pipe(
			Effect.annotateLogs({
				outputDir,
				components:
					[
						plugin.commands?.length ?? 0,
						'commands,',
						plugin.agents?.length ?? 0,
						'agents,',
						plugin.skills?.length ?? 0,
						'skills'
					].join(' '),
				errors: report.errors.length,
				warnings: report.warnings.length
			})
		)
	),
	Effect.withLogSpan('plugin.build')
);

const runtime = ClaudeRuntime.default();
await runtime.runPromise(program);
await runtime.dispose();
