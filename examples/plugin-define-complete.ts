#!/usr/bin/env bun
/**
 * Example: assemble and write a complete Claude Code plugin directory.
 *
 * Unlike the hook examples, this script is a one-shot build tool — not
 * a hook runner. It shows how `Plugin.define` + `Plugin.write` can
 * materialize a plugin manifest, commands, skills, hooks config, and
 * `.mcp.json` to disk from a single declarative description.
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
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import { Plugin } from 'effect-claudecode';

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
		{
			name: 'review',
			content:
				'---\ndescription: Review staged diffs for Effect v4 compliance\n---\n\n# Review\n\nReview the staged changes for Effect v4 compliance and report any issues.\n'
		}
	],
	skills: [
		{
			name: 'greet',
			content:
				'---\nname: greet\ndescription: Say hello to the user\n---\n\n# Greet\n\nSay hi in a friendly tone.\n'
		}
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

const PlatformLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);

const program = Plugin.write(plugin, destDir).pipe(
	Effect.tap(() => Effect.logInfo(`Plugin written to ${destDir}`)),
	Effect.provide(PlatformLive)
);

Effect.runPromise(program);
