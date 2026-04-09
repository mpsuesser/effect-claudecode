/**
 * FileChanged hook event.
 *
 * Fires when a watched file changes on disk. Observability-only — no
 * decision control. Supports a matcher on the basename of `file_path`
 * (e.g. `.envrc`, `package.json`).
 * See https://code.claude.com/docs/en/hooks#filechanged.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export const ChangeType = Schema.Literals([
	'created',
	'modified',
	'deleted'
] as const);

export class Input extends Schema.Class<Input>('FileChangedInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('FileChanged'),
		file_path: Schema.String,
		change_type: ChangeType
	},
	{ description: 'Input for the FileChanged hook event.' }
) {}

export class Output extends Schema.Class<Output>('FileChangedOutput')({
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
	event: 'FileChanged',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
