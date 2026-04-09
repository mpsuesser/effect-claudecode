/**
 * SessionStart hook event.
 *
 * Fires when a Claude Code session begins, resumes, is cleared, or
 * compacts. Does not carry `permission_mode`. The primary use-case is
 * injecting repo-specific context via `addContext`. Supports a matcher
 * on `source`. See https://code.claude.com/docs/en/hooks#sessionstart.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const Source = Schema.Literals([
	'startup',
	'resume',
	'clear',
	'compact'
] as const);

export class Input extends Schema.Class<Input>('SessionStartInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('SessionStart'),
		source: Source,
		model: Schema.optional(Schema.String),
		agent_type: Schema.optional(Schema.String)
	},
	{ description: 'Input for the SessionStart hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'SessionStartHookSpecificOutput'
)({
	hookEventName: Schema.Literal('SessionStart'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('SessionStartOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

export const passthrough = (): Output =>
	new Output({ continue: undefined });

/**
 * Inject additional context at the start of the session. Claude will
 * see this as a system message. The canonical use-case for SessionStart.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'SessionStart',
			additionalContext
		})
	});

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'SessionStart',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
