/**
 * Schema for `.claude-plugin/marketplace.json` — the plugin catalog
 * file that lists one or more plugins alongside their source specs.
 *
 * A marketplace is identified by name, optionally has a description
 * and owner, and declares an array of plugin entries. Each entry
 * declares how to locate the plugin's source (a relative path string,
 * a directory-source object, or a github-source object).
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import { AuthorInfo } from './Manifest.ts';

// ---------------------------------------------------------------------------
// Plugin source spec
// ---------------------------------------------------------------------------

/**
 * A directory-based plugin source. The `path` is resolved relative
 * to the marketplace.json file.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class DirectoryPluginSource extends Schema.Class<DirectoryPluginSource>(
	'DirectoryPluginSource'
)({
	source: Schema.Literal('directory'),
	path: Schema.String
}) {}

/**
 * A GitHub-based plugin source. The `repo` is the `owner/name` pair
 * and the optional `ref` is a branch, tag, or commit SHA.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class GithubPluginSource extends Schema.Class<GithubPluginSource>(
	'GithubPluginSource'
)({
	source: Schema.Literal('github'),
	repo: Schema.String,
	ref: Schema.optional(Schema.String)
}) {}

/**
 * The `source` field on a marketplace entry. Accepts either a raw
 * path string (shorthand for a directory source) or a structured
 * source object.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const MarketplacePluginSourceSpec = Schema.Union([
	Schema.String,
	DirectoryPluginSource,
	GithubPluginSource
]).annotate({ identifier: 'MarketplacePluginSourceSpec' });

export type MarketplacePluginSourceSpec = Schema.Schema.Type<
	typeof MarketplacePluginSourceSpec
>;

// ---------------------------------------------------------------------------
// Marketplace plugin entry
// ---------------------------------------------------------------------------

/**
 * A single plugin entry inside a marketplace.json file. `name` and
 * `source` are required; every other field is informational and may
 * override or supplement what the plugin's own `plugin.json` declares.
 *
 * The `strict` flag controls whether Claude Code refuses to load a
 * plugin that also declares components in its own `plugin.json`
 * (defaults to `true`).
 *
 * @category Schemas
 * @since 0.1.0
 */
export class MarketplacePluginEntry extends Schema.Class<MarketplacePluginEntry>(
	'MarketplacePluginEntry'
)({
	name: Schema.String,
	source: MarketplacePluginSourceSpec,
	description: Schema.optional(Schema.String),
	version: Schema.optional(Schema.String),
	author: Schema.optional(AuthorInfo),
	homepage: Schema.optional(Schema.String),
	repository: Schema.optional(Schema.String),
	license: Schema.optional(Schema.String),
	keywords: Schema.optional(Schema.Array(Schema.String)),
	strict: Schema.optional(Schema.Boolean)
}) {}

// ---------------------------------------------------------------------------
// Marketplace file
// ---------------------------------------------------------------------------

/**
 * The full `.claude-plugin/marketplace.json` file. Lists a bundle of
 * plugins under a shared name and optional owner.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class MarketplaceFile extends Schema.Class<MarketplaceFile>(
	'MarketplaceFile'
)({
	name: Schema.String,
	description: Schema.optional(Schema.String),
	owner: Schema.optional(AuthorInfo),
	plugins: Schema.Array(MarketplacePluginEntry)
}) {}
