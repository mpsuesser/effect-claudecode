/**
 * Typed adapters for common Claude Code tool payloads.
 *
 * The core hook event schemas intentionally preserve Claude Code's raw wire
 * format (`tool_input` / `tool_response` as loose records). This module adds a
 * thin typed layer for the built-in tool shapes documented by Claude Code.
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
	command: Schema.String,
	description: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number),
	run_in_background: Schema.optional(Schema.Boolean)
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
	stdout: Schema.optional(Schema.String),
	stderr: Schema.optional(Schema.String),
	interrupted: Schema.optional(Schema.Boolean),
	isImage: Schema.optional(Schema.Boolean)
}) {}

/**
 * Typed `tool_input` payload for the `Read` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ReadToolInput extends Schema.Class<ReadToolInput>('ReadToolInput')({
	file_path: Schema.String,
	offset: Schema.optional(Schema.Number),
	limit: Schema.optional(Schema.Number)
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
 * Typed `tool_input` payload for the `Write` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class WriteToolInput extends Schema.Class<WriteToolInput>(
	'WriteToolInput'
)({
	file_path: Schema.String,
	content: Schema.String
}) {}

/**
 * Typed `tool_input` payload for the `Edit` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class EditToolInput extends Schema.Class<EditToolInput>('EditToolInput')({
	file_path: Schema.String,
	old_string: Schema.String,
	new_string: Schema.String,
	replace_all: Schema.optional(Schema.Boolean)
}) {}

/**
 * Typed `tool_input` payload for the `Glob` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class GlobToolInput extends Schema.Class<GlobToolInput>('GlobToolInput')({
	pattern: Schema.String,
	path: Schema.optional(Schema.String)
}) {}

export const GrepOutputMode = Schema.Literals([
	'content',
	'files_with_matches',
	'count'
] as const);

/**
 * Typed `tool_input` payload for the `Grep` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class GrepToolInput extends Schema.Class<GrepToolInput>('GrepToolInput')({
	pattern: Schema.String,
	path: Schema.optional(Schema.String),
	glob: Schema.optional(Schema.String),
	output_mode: Schema.optional(GrepOutputMode),
	'-i': Schema.optional(Schema.Boolean),
	multiline: Schema.optional(Schema.Boolean)
}) {}

/**
 * Typed `tool_input` payload for the `WebFetch` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class WebFetchToolInput extends Schema.Class<WebFetchToolInput>(
	'WebFetchToolInput'
)({
	url: Schema.String,
	prompt: Schema.String
}) {}

/**
 * Typed `tool_input` payload for the `WebSearch` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class WebSearchToolInput extends Schema.Class<WebSearchToolInput>(
	'WebSearchToolInput'
)({
	query: Schema.String,
	allowed_domains: Schema.optional(Schema.Array(Schema.String)),
	blocked_domains: Schema.optional(Schema.Array(Schema.String))
}) {}

/**
 * Typed `tool_input` payload for the `Agent` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AgentToolInput extends Schema.Class<AgentToolInput>(
	'AgentToolInput'
)({
	prompt: Schema.String,
	description: Schema.String,
	subagent_type: Schema.String,
	model: Schema.optional(Schema.String)
}) {}

/**
 * Typed `tool_response` payload for the `Agent` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AgentToolResponse extends Schema.Class<AgentToolResponse>(
	'AgentToolResponse'
)({
	status: Schema.optional(
		Schema.Literals(['completed', 'async_launched'] as const)
	),
	agentId: Schema.optional(Schema.String),
	content: Schema.optional(Schema.Array(Schema.Unknown)),
	totalTokens: Schema.optional(Schema.Number),
	totalDurationMs: Schema.optional(Schema.Number),
	totalToolUseCount: Schema.optional(Schema.Number),
	usage: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
	description: Schema.optional(Schema.String),
	prompt: Schema.optional(Schema.String),
	outputFile: Schema.optional(Schema.String)
}) {}

/**
 * A single option for the `AskUserQuestion` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AskUserQuestionOption extends Schema.Class<AskUserQuestionOption>(
	'AskUserQuestionOption'
)({
	label: Schema.String,
	description: Schema.optional(Schema.String)
}) {}

/**
 * A single question for the `AskUserQuestion` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AskUserQuestionQuestion extends Schema.Class<AskUserQuestionQuestion>(
	'AskUserQuestionQuestion'
)({
	question: Schema.String,
	header: Schema.String,
	options: Schema.Array(AskUserQuestionOption),
	multiSelect: Schema.optional(Schema.Boolean)
}) {}

/**
 * Typed `tool_input` payload for the `AskUserQuestion` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AskUserQuestionToolInput extends Schema.Class<AskUserQuestionToolInput>(
	'AskUserQuestionToolInput'
)({
	questions: Schema.Array(AskUserQuestionQuestion),
	answers: Schema.optional(Schema.Record(Schema.String, Schema.String))
}) {}

/**
 * A prompt-based permission request in `ExitPlanMode`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ExitPlanAllowedPrompt extends Schema.Class<ExitPlanAllowedPrompt>(
	'ExitPlanAllowedPrompt'
)({
	tool: Schema.String,
	prompt: Schema.String
}) {}

/**
 * Typed `tool_input` payload for the `ExitPlanMode` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ExitPlanModeToolInput extends Schema.Class<ExitPlanModeToolInput>(
	'ExitPlanModeToolInput'
)({
	plan: Schema.String,
	planFilePath: Schema.String,
	allowedPrompts: Schema.optional(Schema.Array(ExitPlanAllowedPrompt))
}) {}

/**
 * Typed `tool_response` payload for the `ExitPlanMode` tool.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ExitPlanModeToolResponse extends Schema.Class<ExitPlanModeToolResponse>(
	'ExitPlanModeToolResponse'
)({
	plan: Schema.optional(Schema.String),
	filePath: Schema.optional(Schema.String),
	approved: Schema.optional(Schema.Boolean)
}) {}

// ---------------------------------------------------------------------------
// Built-in adapters
// ---------------------------------------------------------------------------

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
 * Built-in adapter for the `Write` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const WriteAdapter = definePostAdapter({
	toolName: 'Write',
	inputSchema: WriteToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `Edit` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const EditAdapter = definePostAdapter({
	toolName: 'Edit',
	inputSchema: EditToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `Glob` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const GlobAdapter = definePostAdapter({
	toolName: 'Glob',
	inputSchema: GlobToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `Grep` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const GrepAdapter = definePostAdapter({
	toolName: 'Grep',
	inputSchema: GrepToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `WebFetch` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const WebFetchAdapter = definePostAdapter({
	toolName: 'WebFetch',
	inputSchema: WebFetchToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `WebSearch` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const WebSearchAdapter = definePostAdapter({
	toolName: 'WebSearch',
	inputSchema: WebSearchToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `Agent` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const AgentAdapter = definePostAdapter({
	toolName: 'Agent',
	inputSchema: AgentToolInput,
	responseSchema: AgentToolResponse
});

/**
 * Built-in adapter for the `AskUserQuestion` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const AskUserQuestionAdapter = definePostAdapter({
	toolName: 'AskUserQuestion',
	inputSchema: AskUserQuestionToolInput,
	responseSchema: Schema.Unknown
});

/**
 * Built-in adapter for the `ExitPlanMode` tool.
 *
 * @category Adapters
 * @since 0.1.0
 */
export const ExitPlanModeAdapter = definePostAdapter({
	toolName: 'ExitPlanMode',
	inputSchema: ExitPlanModeToolInput,
	responseSchema: ExitPlanModeToolResponse
});

/**
 * Tool names with built-in typed adapters.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const SupportedToolName = Schema.Literals([
	'Bash',
	'Read',
	'Write',
	'Edit',
	'Glob',
	'Grep',
	'WebFetch',
	'WebSearch',
	'Agent',
	'AskUserQuestion',
	'ExitPlanMode'
] as const);

export type SupportedToolName = typeof SupportedToolName.Type;

interface PreToolTypeMap {
	readonly Bash: BashToolInput;
	readonly Read: ReadToolInput;
	readonly Write: WriteToolInput;
	readonly Edit: EditToolInput;
	readonly Glob: GlobToolInput;
	readonly Grep: GrepToolInput;
	readonly WebFetch: WebFetchToolInput;
	readonly WebSearch: WebSearchToolInput;
	readonly Agent: AgentToolInput;
	readonly AskUserQuestion: AskUserQuestionToolInput;
	readonly ExitPlanMode: ExitPlanModeToolInput;
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
	readonly Write: {
		readonly tool: WriteToolInput;
		readonly response: unknown;
	};
	readonly Edit: {
		readonly tool: EditToolInput;
		readonly response: unknown;
	};
	readonly Glob: {
		readonly tool: GlobToolInput;
		readonly response: unknown;
	};
	readonly Grep: {
		readonly tool: GrepToolInput;
		readonly response: unknown;
	};
	readonly WebFetch: {
		readonly tool: WebFetchToolInput;
		readonly response: unknown;
	};
	readonly WebSearch: {
		readonly tool: WebSearchToolInput;
		readonly response: unknown;
	};
	readonly Agent: {
		readonly tool: AgentToolInput;
		readonly response: AgentToolResponse;
	};
	readonly AskUserQuestion: {
		readonly tool: AskUserQuestionToolInput;
		readonly response: unknown;
	};
	readonly ExitPlanMode: {
		readonly tool: ExitPlanModeToolInput;
		readonly response: ExitPlanModeToolResponse;
	};
}

const preToolAdapters: {
	readonly [K in SupportedToolName]: PreToolAdapter<K, PreToolTypeMap[K]>;
} = {
	Bash: BashAdapter,
	Read: ReadAdapter,
	Write: WriteAdapter,
	Edit: EditAdapter,
	Glob: GlobAdapter,
	Grep: GrepAdapter,
	WebFetch: WebFetchAdapter,
	WebSearch: WebSearchAdapter,
	Agent: AgentAdapter,
	AskUserQuestion: AskUserQuestionAdapter,
	ExitPlanMode: ExitPlanModeAdapter
};

const postToolAdapters: {
	readonly [K in SupportedToolName]: PostToolAdapter<
		K,
		PostToolTypeMap[K]['tool'],
		PostToolTypeMap[K]['response']
	>;
} = {
	Bash: BashAdapter,
	Read: ReadAdapter,
	Write: WriteAdapter,
	Edit: EditAdapter,
	Glob: GlobAdapter,
	Grep: GrepAdapter,
	WebFetch: WebFetchAdapter,
	WebSearch: WebSearchAdapter,
	Agent: AgentAdapter,
	AskUserQuestion: AskUserQuestionAdapter,
	ExitPlanMode: ExitPlanModeAdapter
};

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
	readonly payload: 'tool_name' | 'tool_input' | 'tool_response';
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

const ensureToolName = (options: {
	readonly event: 'PreToolUse' | 'PostToolUse';
	readonly expected: string;
	readonly actual: string;
}): Effect.Effect<void, HookToolDecodeError> =>
	options.actual === options.expected
		? Effect.void
		: Effect.fail(
				new HookToolDecodeError({
					event: options.event,
					toolName: options.expected,
					payload: 'tool_name',
					cause: `Expected tool_name ${options.expected}, received ${options.actual}`
				})
		  );

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
	ensureToolName({
		event: 'PreToolUse',
		expected: adapter.toolName,
		actual: input.tool_name
	}).pipe(
		Effect.flatMap(() =>
			decodeToolInput({
				event: 'PreToolUse',
				toolName: adapter.toolName,
				payload: 'tool_input',
				value: input.tool_input,
				decode: Schema.decodeUnknownSync(adapter.inputSchema)
			})
		),
		Effect.map((tool) => ({ input, tool }))
	);

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
	ensureToolName({
		event: 'PostToolUse',
		expected: adapter.toolName,
		actual: input.tool_name
	}).pipe(
		Effect.flatMap(() =>
			Effect.all(
				{
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
				},
				{ concurrency: 1 }
			)
		),
		Effect.map(({ tool, response }) => ({ input, tool, response }))
	);

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
	decodePreToolUseWith(preToolAdapters[toolName], input);

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
	decodePostToolUseWith(postToolAdapters[toolName], input);
