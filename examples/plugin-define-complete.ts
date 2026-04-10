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
 *     bun examples/plugin-define-complete.ts /tmp/my-plugin
 *
 * Resulting directory structure:
 *
 *     /tmp/my-plugin/
 *         .claude-plugin/plugin.json
 *         commands/review.md
 *         skills/greet/SKILL.md
 *         hooks/hooks.json
 *         .mcp.json
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';

import { ClaudeRuntime, Plugin } from 'effect-claudecode';

const plugin = Plugin.define({
	manifest: {
		name: 'effect-guardrails',
		version: '0.1.0',
		description: 'Effect-first guardrail hooks for Claude Code',
		author: new Plugin.AuthorInfo({
			name: 'Alice',
			email: 'alice@example.com'
		}),
		keywords: ['effect', 'guardrails', 'claude-code']
	},
	commands: [
		Plugin.command({
			name: 'review',
			description: 'Review staged diffs for Effect v4 compliance',
			body:
				'# Review\n\nReview the staged changes for Effect v4 compliance and report any issues.\n'
		})
	],
	skills: [
		Plugin.skill({
			name: 'greet',
			description: 'Say hello to the user',
			body: '# Greet\n\nSay hi in a friendly tone.\n'
		})
	],
	hooksConfig: {
		PreToolUse: [
			{
				matcher: 'Bash',
				hooks: [
					{
						type: 'command',
						command: 'bun ${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash.ts'
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

const destDir = process.argv[2] ?? './dist-plugin';

const program = Plugin.validate(plugin).pipe(
	Effect.flatMap(() => Plugin.write(plugin, destDir)),
	Effect.flatMap(() => Plugin.doctor(destDir)),
	Effect.tap((report) =>
		Effect.logInfo('plugin materialized').pipe(
			Effect.annotateLogs({
				destDir,
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
