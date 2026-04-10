/**
 * InstructionsLoaded hook event.
 *
 * Fires when a CLAUDE.md or .claude/rules/*.md instruction file is loaded
 * into the session context. Observability-only — the hook's output is not
 * acted on. Supports a matcher on `load_reason`.
 * See https://code.claude.com/docs/en/hooks#instructionsloaded.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

export const MemoryType = Schema.Literals([
	'User',
	'Project',
	'Local',
	'Managed',
	'Nested'
] as const);

export const LoadReason = Schema.Literals([
	'session_start',
	'nested_traversal',
	'path_glob_match',
	'include',
	'compact'
] as const);

export class Input extends Schema.Class<Input>('InstructionsLoadedInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('InstructionsLoaded'),
		file_path: Schema.String,
		memory_type: MemoryType,
		load_reason: LoadReason,
		globs: Schema.optional(Schema.Array(Schema.String)),
		trigger_file_path: Schema.optional(Schema.String),
		parent_file_path: Schema.optional(Schema.String)
	},
	{ description: 'Input for the InstructionsLoaded hook event.' }
) {}

export class Output extends Schema.Class<Output>('InstructionsLoadedOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'InstructionsLoaded',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build an InstructionsLoaded hook that only handles matching `load_reason`
 * values.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const onMatcher = (config: {
	readonly matcher: string | RegExp;
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onMismatch?: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> =>
	define({
		handler: Matcher.handleMatcher({
			matcher: config.matcher,
			select: (input) => input.load_reason,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(passthrough()))
		})
	});
