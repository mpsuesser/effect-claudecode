/**
 * Typed adapters for common Claude Code tool payloads.
 *
 * The core hook event schemas intentionally preserve Claude Code's raw wire
 * format (`tool_input` / `tool_response` as loose records). This module adds a
 * thin typed layer for the tool shapes that the library can validate with
 * confidence today.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { HookToolDecodeError } from '../Errors.ts';
import type * as PostToolUse from './Events/PostToolUse.ts';
import type * as PreToolUse from './Events/PreToolUse.ts';

// ---------------------------------------------------------------------------
// Supported tool payload schemas
// ---------------------------------------------------------------------------

/**
 * Typed `tool_input` payload for the `Bash` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class BashToolInput extends Schema.Class<BashToolInput>('BashToolInput')({
	command: Schema.String
}) {}

/**
 * Typed `tool_response` payload for the `Bash` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class BashToolResponse extends Schema.Class<BashToolResponse>(
	'BashToolResponse'
)({
	output: Schema.optional(Schema.String),
	exit_code: Schema.optional(Schema.Number)
}) {}

/**
 * Typed `tool_input` payload for the `Read` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ReadToolInput extends Schema.Class<ReadToolInput>('ReadToolInput')({
	file_path: Schema.String
}) {}

/**
 * Typed `tool_response` payload for the `Read` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ReadToolResponse extends Schema.Class<ReadToolResponse>(
	'ReadToolResponse'
)({
	content: Schema.optional(Schema.String)
}) {}

/**
 * Tool names with built-in typed adapters.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const SupportedToolName = Schema.Literals(['Bash', 'Read'] as const);

export type SupportedToolName = typeof SupportedToolName.Type;

interface PreToolTypeMap {
	readonly Bash: BashToolInput;
	readonly Read: ReadToolInput;
}

interface PostToolTypeMap {
	readonly Bash: {
		readonly tool: BashToolInput;
		readonly response: BashToolResponse;
	};
	readonly Read: {
		readonly tool: ReadToolInput;
		readonly response: ReadToolResponse;
	};
}

/**
 * Decoded typed view over a `PreToolUse` payload.
 *
 * @category Models
 * @since 0.1.0
 */
export type DecodedPreToolUse<T extends SupportedToolName> = {
	readonly input: PreToolUse.Input;
	readonly tool: PreToolTypeMap[T];
};

/**
 * Decoded typed view over a `PostToolUse` payload.
 *
 * @category Models
 * @since 0.1.0
 */
export type DecodedPostToolUse<T extends SupportedToolName> = {
	readonly input: PostToolUse.Input;
} & PostToolTypeMap[T];

const decodeToolInput = <A>(options: {
	readonly event: 'PreToolUse' | 'PostToolUse';
	readonly toolName: string;
	readonly payload: 'tool_input' | 'tool_response';
	readonly value: unknown;
	readonly decode: (value: unknown) => A;
}): Effect.Effect<A, HookToolDecodeError> =>
	Effect.try({
		try: () => options.decode(options.value),
		catch: (cause) =>
			new HookToolDecodeError({
				event: options.event,
				toolName: options.toolName,
				payload: options.payload,
				cause
			})
	});

const decodeBashToolInput = Schema.decodeUnknownSync(BashToolInput);
const decodeBashToolResponse = Schema.decodeUnknownSync(BashToolResponse);
const decodeReadToolInput = Schema.decodeUnknownSync(ReadToolInput);
const decodeReadToolResponse = Schema.decodeUnknownSync(ReadToolResponse);

/**
 * Decode the typed payload for a supported `PreToolUse` tool event.
 *
 * @category Decoding
 * @since 0.1.0
 */
export const decodePreToolUse = <T extends SupportedToolName>(
	toolName: T,
	input: PreToolUse.Input
): Effect.Effect<DecodedPreToolUse<T>, HookToolDecodeError> =>
	toolName === 'Bash'
		? decodeToolInput({
				event: 'PreToolUse',
				toolName,
				payload: 'tool_input',
				value: input.tool_input,
				decode: decodeBashToolInput
		  }).pipe(
				Effect.map((tool) => ({ input, tool }))
			) as never
		: decodeToolInput({
				event: 'PreToolUse',
				toolName,
				payload: 'tool_input',
				value: input.tool_input,
				decode: decodeReadToolInput
		  }).pipe(
				Effect.map((tool) => ({ input, tool }))
			) as never;

/**
 * Decode the typed payload for a supported `PostToolUse` tool event.
 *
 * @category Decoding
 * @since 0.1.0
 */
export const decodePostToolUse = <T extends SupportedToolName>(
	toolName: T,
	input: PostToolUse.Input
): Effect.Effect<DecodedPostToolUse<T>, HookToolDecodeError> =>
	toolName === 'Bash'
		? Effect.all({
				tool: decodeToolInput({
					event: 'PostToolUse',
					toolName,
					payload: 'tool_input',
					value: input.tool_input,
					decode: decodeBashToolInput
				}),
				response: decodeToolInput({
					event: 'PostToolUse',
					toolName,
					payload: 'tool_response',
					value: input.tool_response,
					decode: decodeBashToolResponse
				})
		  }).pipe(
				Effect.map(({ tool, response }) => ({ input, tool, response }))
			) as never
		: Effect.all({
				tool: decodeToolInput({
					event: 'PostToolUse',
					toolName,
					payload: 'tool_input',
					value: input.tool_input,
					decode: decodeReadToolInput
				}),
				response: decodeToolInput({
					event: 'PostToolUse',
					toolName,
					payload: 'tool_response',
					value: input.tool_response,
					decode: decodeReadToolResponse
				})
		  }).pipe(
				Effect.map(({ tool, response }) => ({ input, tool, response }))
			) as never;
