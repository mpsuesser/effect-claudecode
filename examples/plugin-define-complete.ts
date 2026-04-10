#!/usr/bin/env bun
/**
 * Example: assemble and write a complete Claude Code plugin directory.
 *
 * Unlike the hook examples, this script is a one-shot build tool — not
 * a hook runner. It shows how `Plugin.define`, `Plugin.validate`,
 * `Plugin.write`, and `Plugin.doctor` compose into one Effect pipeline
 * that materializes a plugin manifest, commands, skills, hooks config,
 * and `.mcp.json` to disk from a single declarative description.
 *
 * Run:
 *
 *     bun examples/plugin-define-complete.ts artifacts/effect-review-kit
 *
 * Resulting directory structure:
 *
 *     artifacts/effect-review-kit/
 *         .claude-plugin/plugin.json
 *         commands/review.md
 *         skills/effect-first/SKILL.md
 *         output-styles/concise-review.md
 *         hooks/hooks.json
 *         .mcp.json
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';

import { ClaudeRuntime, Plugin } from 'effect-claudecode';

const plugin = Plugin.define({
	manifest: {
		name: 'effect-review-kit',
		version: '0.1.0',
		description: 'Project-aware review defaults for Claude Code',
		author: new Plugin.AuthorInfo({
			name: 'Alice',
			email: 'alice@example.com'
		}),
		keywords: ['effect', 'review', 'claude-code']
	},
	commands: [
		Plugin.command({
			name: 'review',
			description: 'Review staged changes with project conventions',
			body:
				'# Review\n\nReview the staged changes. Lead with concrete findings, then call out regressions and missing tests.\n'
		})
	],
	skills: [
		Plugin.skill({
			name: 'effect-first',
			description: 'Keep implementations aligned with Effect v4 conventions',
			body:
				'# Effect-First\n\nPrefer typed errors, `Option` for absence, and `Schema` decoding at boundaries.\n'
		})
	],
	outputStyles: [
		Plugin.outputStyle({
			name: 'concise-review',
			description: 'Lead with findings and keep the summary tight',
			body:
				'# Concise Review\n\nStart with issues worth fixing. Keep supporting detail brief and specific.\n'
		})
	],
	hooksConfig: {
		PostToolUse: [
			{
				matcher: 'Read',
				hooks: [
					{
						type: 'command',
						command:
							'bun ${CLAUDE_PLUGIN_ROOT}/hooks/post-read-source-hint.ts'
					}
				]
			}
		]
	},
	mcpConfig: {
		mcpServers: {
			filesystem: {
				type: 'stdio',
				command: 'mcp-filesystem',
				args: ['--root', '.']
			}
		}
	}
});

const outputDir = process.argv[2] ?? 'artifacts/effect-review-kit';

const program = Plugin.validate(plugin).pipe(
	Effect.flatMap(() => Plugin.write(plugin, outputDir)),
	Effect.flatMap(() => Plugin.doctor(outputDir)),
	Effect.tap((report) =>
		Effect.logInfo('plugin materialized').pipe(
			Effect.annotateLogs({
				outputDir,
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
