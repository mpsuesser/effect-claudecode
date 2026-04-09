/**
 * Base envelope fields shared by every Claude Code hook event.
 *
 * `envelopeFields` is the reusable field record each event spreads into
 * its own input schema. `HookEnvelope` is the named `Schema.Class` that
 * decodes the base shape alone (useful for tooling and tests that only
 * care about the envelope).
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Field record (reusable across event schemas)
// ---------------------------------------------------------------------------

/**
 * The field record for the hook envelope, reusable via spread:
 *
 * ```ts
 * class PreToolUseInput extends Schema.Class<PreToolUseInput>('PreToolUseInput')({
 *   ...envelopeFields,
 *   hook_event_name: Schema.Literal('PreToolUse'),
 *   tool_name: Schema.String,
 *   tool_input: Schema.Record(Schema.String, Schema.Unknown)
 * }) {}
 * ```
 *
 * `permission_mode` is `optionalKey` because a number of events omit it
 * entirely (SessionStart, SessionEnd, PreCompact, CwdChanged, FileChanged,
 * InstructionsLoaded, etc.).
 *
 * `hook_event_name` is `Schema.String` here; individual event schemas
 * re-declare it as `Schema.Literal(...)` by spreading and overriding.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const envelopeFields = {
	session_id: Schema.String,
	transcript_path: Schema.String,
	cwd: Schema.String,
	hook_event_name: Schema.String,
	permission_mode: Schema.optionalKey(Schema.String)
} as const;

// ---------------------------------------------------------------------------
// Envelope schema class
// ---------------------------------------------------------------------------

/**
 * The base envelope as a named, decodable class. Every hook event input
 * is a superset of these fields.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class HookEnvelope extends Schema.Class<HookEnvelope>('HookEnvelope')(
	envelopeFields,
	{
		description:
			'Base fields present in every Claude Code hook event payload'
	}
) {}
