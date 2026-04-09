/**
 * Tagged errors for effect-claudecode.
 *
 * All cross-module errors are declared here and re-exported from
 * `src/index.ts` at the top level so consumers can import them directly
 * (e.g. `import { HookInputDecodeError } from 'effect-claudecode'`) and
 * use them in `Effect.catchTag`.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Hook runner errors
// ---------------------------------------------------------------------------

/**
 * Raised when reading from stdin fails.
 *
 * Exit-code mapping: 1 (non-blocking).
 *
 * @category Hook errors
 * @since 0.1.0
 */
export class HookStdinReadError extends Schema.TaggedErrorClass<HookStdinReadError>(
	'effect-claudecode/HookStdinReadError'
)('HookStdinReadError', {
	cause: Schema.Defect
}) {}

/**
 * Raised when decoding hook input fails. The `phase` field distinguishes
 * JSON parse failure (`'json'`) from schema validation failure (`'schema'`).
 *
 * Exit-code mapping: 2 (blocking) — Claude Code halts the pending action.
 *
 * @category Hook errors
 * @since 0.1.0
 */
export class HookInputDecodeError extends Schema.TaggedErrorClass<HookInputDecodeError>(
	'effect-claudecode/HookInputDecodeError'
)('HookInputDecodeError', {
	cause: Schema.Defect,
	phase: Schema.Literals(['json', 'schema'])
}) {}

/**
 * Raised when the user-supplied hook handler fails.
 *
 * Exit-code mapping: 1 (non-blocking).
 *
 * @category Hook errors
 * @since 0.1.0
 */
export class HookHandlerError extends Schema.TaggedErrorClass<HookHandlerError>(
	'effect-claudecode/HookHandlerError'
)('HookHandlerError', {
	cause: Schema.Defect
}) {}

/**
 * Raised when encoding the handler output to JSON fails.
 *
 * Exit-code mapping: 1 (non-blocking).
 *
 * @category Hook errors
 * @since 0.1.0
 */
export class HookOutputEncodeError extends Schema.TaggedErrorClass<HookOutputEncodeError>(
	'effect-claudecode/HookOutputEncodeError'
)('HookOutputEncodeError', {
	cause: Schema.Defect
}) {}

/**
 * Raised when writing to stdout fails.
 *
 * Exit-code mapping: 1 (non-blocking).
 *
 * @category Hook errors
 * @since 0.1.0
 */
export class HookStdoutWriteError extends Schema.TaggedErrorClass<HookStdoutWriteError>(
	'effect-claudecode/HookStdoutWriteError'
)('HookStdoutWriteError', {
	cause: Schema.Defect
}) {}

// ---------------------------------------------------------------------------
// Transcript errors
// ---------------------------------------------------------------------------

/**
 * Raised when reading or parsing a transcript file fails.
 *
 * @category Transcript errors
 * @since 0.1.0
 */
export class TranscriptReadError extends Schema.TaggedErrorClass<TranscriptReadError>(
	'effect-claudecode/TranscriptReadError'
)('TranscriptReadError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

// ---------------------------------------------------------------------------
// Settings errors
// ---------------------------------------------------------------------------

/**
 * Raised when reading a settings.json file fails (I/O error, etc.).
 *
 * @category Settings errors
 * @since 0.1.0
 */
export class SettingsReadError extends Schema.TaggedErrorClass<SettingsReadError>(
	'effect-claudecode/SettingsReadError'
)('SettingsReadError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

/**
 * Raised when a settings.json file contains invalid JSON.
 *
 * @category Settings errors
 * @since 0.1.0
 */
export class SettingsParseError extends Schema.TaggedErrorClass<SettingsParseError>(
	'effect-claudecode/SettingsParseError'
)('SettingsParseError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

/**
 * Raised when a settings.json file parses as JSON but fails schema
 * validation.
 *
 * @category Settings errors
 * @since 0.1.0
 */
export class SettingsDecodeError extends Schema.TaggedErrorClass<SettingsDecodeError>(
	'effect-claudecode/SettingsDecodeError'
)('SettingsDecodeError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

// ---------------------------------------------------------------------------
// Plugin errors
// ---------------------------------------------------------------------------

/**
 * Raised when materializing a plugin directory fails (I/O error during
 * `mkdir`, `writeFile`, or JSON encoding of the manifest).
 *
 * @category Plugin errors
 * @since 0.1.0
 */
export class PluginWriteError extends Schema.TaggedErrorClass<PluginWriteError>(
	'effect-claudecode/PluginWriteError'
)('PluginWriteError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

// ---------------------------------------------------------------------------
// Frontmatter errors
// ---------------------------------------------------------------------------

/**
 * Raised when reading a markdown file with YAML frontmatter fails
 * (I/O error, etc.).
 *
 * @category Frontmatter errors
 * @since 0.1.0
 */
export class FrontmatterReadError extends Schema.TaggedErrorClass<FrontmatterReadError>(
	'effect-claudecode/FrontmatterReadError'
)('FrontmatterReadError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

/**
 * Raised when a markdown file's YAML frontmatter fails to parse as
 * valid YAML, or when the frontmatter delimiters (`---`) are
 * malformed.
 *
 * @category Frontmatter errors
 * @since 0.1.0
 */
export class FrontmatterParseError extends Schema.TaggedErrorClass<FrontmatterParseError>(
	'effect-claudecode/FrontmatterParseError'
)('FrontmatterParseError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

/**
 * Raised when a markdown file's frontmatter parses as YAML but fails
 * schema validation against the expected shape (Skill, Subagent,
 * Command, or OutputStyle).
 *
 * @category Frontmatter errors
 * @since 0.1.0
 */
export class FrontmatterDecodeError extends Schema.TaggedErrorClass<FrontmatterDecodeError>(
	'effect-claudecode/FrontmatterDecodeError'
)('FrontmatterDecodeError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}

// ---------------------------------------------------------------------------
// MCP errors
// ---------------------------------------------------------------------------

/**
 * Raised when a `.mcp.json` file fails to read, parse, or decode.
 *
 * @category MCP errors
 * @since 0.1.0
 */
export class McpConfigError extends Schema.TaggedErrorClass<McpConfigError>(
	'effect-claudecode/McpConfigError'
)('McpConfigError', {
	path: Schema.String,
	cause: Schema.Defect
}) {}
