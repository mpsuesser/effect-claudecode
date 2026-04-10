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
// Adapter models
// ---------------------------------------------------------------------------

/**
 * Typed adapter for decoding a `tool_input` payload.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PreToolAdapter<TName extends string, TTool> {
	readonly toolName: TName;
	readonly inputSchema: Schema.Decoder<TTool>;
}

/**
 * Typed adapter for decoding both `tool_input` and `tool_response` payloads.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PostToolAdapter<TName extends string, TTool, TResponse>
	extends PreToolAdapter<TName, TTool> {
	readonly responseSchema: Schema.Decoder<TResponse>;
}

/**
 * Define a typed pre-tool adapter from a schema.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const definePreAdapter = <const TName extends string, TTool>(config: {
	readonly toolName: TName;
	readonly inputSchema: Schema.Decoder<TTool>;
}): PreToolAdapter<TName, TTool> => config;

/**
 * Define a typed post-tool adapter from input / response schemas.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const definePostAdapter = <
	const TName extends string,
	TTool,
	TResponse
>(config: {
	readonly toolName: TName;
	readonly inputSchema: Schema.Decoder<TTool>;
	readonly responseSchema: Schema.Decoder<TResponse>;
}): PostToolAdapter<TName, TTool, TResponse> => config;

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
 * Built-in adapter for the `Bash` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const BashAdapter = definePostAdapter({
	toolName: 'Bash',
	inputSchema: BashToolInput,
	responseSchema: BashToolResponse
});

/**
 * Built-in adapter for the `Read` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const ReadAdapter = definePostAdapter({
	toolName: 'Read',
	inputSchema: ReadToolInput,
	responseSchema: ReadToolResponse
});

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
export type DecodedPreToolUseWith<TTool> = {
	readonly input: PreToolUse.Input;
	readonly tool: TTool;
};

/**
 * Decoded typed view over a built-in `PreToolUse` payload.
 *
 * @category Models
 * @since 0.1.0
 */
export type DecodedPreToolUse<T extends SupportedToolName> =
	DecodedPreToolUseWith<PreToolTypeMap[T]>;

/**
 * Decoded typed view over a `PostToolUse` payload.
 *
 * @category Models
 * @since 0.1.0
 */
export type DecodedPostToolUseWith<TTool, TResponse> = {
	readonly input: PostToolUse.Input;
	readonly tool: TTool;
	readonly response: TResponse;
};

/**
 * Decoded typed view over a built-in `PostToolUse` payload.
 *
 * @category Models
 * @since 0.1.0
 */
export type DecodedPostToolUse<T extends SupportedToolName> =
	DecodedPostToolUseWith<
		PostToolTypeMap[T]['tool'],
		PostToolTypeMap[T]['response']
	>;

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

/**
 * Decode a `PreToolUse` payload with a custom adapter.
 *
 * @category Decoding
 * @since 0.1.0
 */
export const decodePreToolUseWith = <TName extends string, TTool>(
	adapter: PreToolAdapter<TName, TTool>,
	input: PreToolUse.Input
): Effect.Effect<DecodedPreToolUseWith<TTool>, HookToolDecodeError> =>
	decodeToolInput({
		event: 'PreToolUse',
		toolName: adapter.toolName,
		payload: 'tool_input',
		value: input.tool_input,
		decode: Schema.decodeUnknownSync(adapter.inputSchema)
	}).pipe(Effect.map((tool) => ({ input, tool })));

/**
 * Decode a `PostToolUse` payload with a custom adapter.
 *
 * @category Decoding
 * @since 0.1.0
 */
export const decodePostToolUseWith = <TName extends string, TTool, TResponse>(
	adapter: PostToolAdapter<TName, TTool, TResponse>,
	input: PostToolUse.Input
): Effect.Effect<
	DecodedPostToolUseWith<TTool, TResponse>,
	HookToolDecodeError
> =>
	Effect.all({
		tool: decodeToolInput({
			event: 'PostToolUse',
			toolName: adapter.toolName,
			payload: 'tool_input',
			value: input.tool_input,
			decode: Schema.decodeUnknownSync(adapter.inputSchema)
		}),
		response: decodeToolInput({
			event: 'PostToolUse',
			toolName: adapter.toolName,
			payload: 'tool_response',
			value: input.tool_response,
			decode: Schema.decodeUnknownSync(adapter.responseSchema)
		})
	}).pipe(Effect.map(({ tool, response }) => ({ input, tool, response })));

/**
 * Decode the typed payload for a supported `PreToolUse` tool event.
 *
 * @category Decoding
 * @since 0.1.0
 */
export function decodePreToolUse(
	toolName: 'Bash',
	input: PreToolUse.Input
): Effect.Effect<DecodedPreToolUse<'Bash'>, HookToolDecodeError>;
export function decodePreToolUse(
	toolName: 'Read',
	input: PreToolUse.Input
): Effect.Effect<DecodedPreToolUse<'Read'>, HookToolDecodeError>;
export function decodePreToolUse(
	toolName: SupportedToolName,
	input: PreToolUse.Input
): Effect.Effect<DecodedPreToolUse<SupportedToolName>, HookToolDecodeError> {
	return toolName === 'Bash'
		? decodePreToolUseWith(BashAdapter, input)
		: decodePreToolUseWith(ReadAdapter, input);
}

/**
 * Decode the typed payload for a supported `PostToolUse` tool event.
 *
 * @category Decoding
 * @since 0.1.0
 */
export function decodePostToolUse(
	toolName: 'Bash',
	input: PostToolUse.Input
): Effect.Effect<DecodedPostToolUse<'Bash'>, HookToolDecodeError>;
export function decodePostToolUse(
	toolName: 'Read',
	input: PostToolUse.Input
): Effect.Effect<DecodedPostToolUse<'Read'>, HookToolDecodeError>;
export function decodePostToolUse(
	toolName: SupportedToolName,
	input: PostToolUse.Input
): Effect.Effect<DecodedPostToolUse<SupportedToolName>, HookToolDecodeError> {
	return toolName === 'Bash'
		? decodePostToolUseWith(BashAdapter, input)
		: decodePostToolUseWith(ReadAdapter, input);
}
