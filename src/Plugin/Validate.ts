/**
 * Cross-file plugin validation, linting, and on-disk diagnostics.
 *
 * @since 0.1.0
 */
import * as Arr from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
import * as Order from 'effect/Order';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';

import {
	isMarkdownFilePath,
	isSkillFilePath,
	pathSpecs
} from './Layout.ts';
import type {
	LoadedPlugin,
	PluginScan
} from './Load.ts';
import { load, scan } from './Load.ts';
import type {
	PluginAgentEntry,
	PluginCommandEntry,
	PluginDefinition,
	PluginOutputStyleEntry,
	PluginSkillEntry
} from './Define.ts';
import { HooksSection } from '../Settings/HooksSection.ts';
import { McpJsonFile } from '../Mcp.ts';

/**
 * Severity level for plugin issues.
 *
 * @category Models
 * @since 0.1.0
 */
export const PluginIssueSeverity = Schema.Literals(['error', 'warning'] as const);

export type PluginIssueSeverity = typeof PluginIssueSeverity.Type;

/**
 * A validation or lint finding for a plugin definition.
 *
 * @category Models
 * @since 0.1.0
 */
export class PluginIssue extends Schema.Class<PluginIssue>('PluginIssue')({
	code: Schema.String,
	severity: PluginIssueSeverity,
	message: Schema.String,
	path: Schema.optional(Schema.String)
}) {}

/**
 * Raised when `Plugin.validate` encounters one or more error-severity issues.
 *
 * @category Errors
 * @since 0.1.0
 */
export class PluginValidationError extends Schema.TaggedErrorClass<PluginValidationError>(
	'effect-claudecode/PluginValidationError'
)('PluginValidationError', {
	issues: Schema.Array(PluginIssue)
}) {}

/**
 * Structured lint report for an in-memory plugin definition.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginLintReport {
	readonly issues: ReadonlyArray<PluginIssue>;
	readonly errors: ReadonlyArray<PluginIssue>;
	readonly warnings: ReadonlyArray<PluginIssue>;
}

/**
 * Structured on-disk diagnostic report for a plugin root.
 *
 * @category Models
 * @since 0.1.0
 */
export interface PluginDoctorReport extends PluginLintReport {
	readonly scanned: PluginScan;
	readonly loaded: LoadedPlugin;
}

type FlatEntry = PluginCommandEntry | PluginAgentEntry | PluginOutputStyleEntry;

const hooksEquivalence = Schema.toEquivalence(Schema.Record(Schema.String, Schema.Array(Schema.Unknown)));
const mcpEquivalence = Schema.toEquivalence(McpJsonFile);

const issue = (options: {
	readonly code: string;
	readonly severity: PluginIssueSeverity;
	readonly message: string;
	readonly path?: string;
}): PluginIssue =>
	new PluginIssue({
		code: options.code,
		severity: options.severity,
		message: options.message,
		...(options.path !== undefined ? { path: options.path } : {})
	});

const splitIssues = (issues: ReadonlyArray<PluginIssue>): PluginLintReport => ({
	issues,
	errors: Arr.filter(issues, (item) => item.severity === 'error'),
	warnings: Arr.filter(issues, (item) => item.severity === 'warning')
});

const duplicateValues = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
	Arr.sort(
		Arr.filter(
			Arr.dedupe(values),
			(value) => Arr.filter(values, (candidate) => candidate === value).length > 1
		),
		Order.String
	);

const entryPathOption = (entry: { readonly path?: string }): Option.Option<string> =>
	Option.fromNullishOr(entry.path);

const entryPaths = (
	entries: ReadonlyArray<{ readonly path?: string }>
): ReadonlyArray<string> =>
	Arr.flatMap(entries, (entry) =>
		Option.match(entryPathOption(entry), {
			onNone: (): ReadonlyArray<string> => [],
			onSome: (entryPath) => [entryPath]
		})
	);

const matchesFlatSpec = (
	entryPath: string,
	spec: Option.Option<string | ReadonlyArray<string>>
): boolean => {
	const specs = pathSpecs(spec);
	if (specs.length === 0) {
		return true;
	}
	return Arr.some(specs, (candidate) =>
		isMarkdownFilePath(candidate)
			? entryPath === candidate
			: entryPath.startsWith(`${candidate}/`)
	);
};

const matchesSkillSpec = (
	entryPath: string,
	spec: Option.Option<string | ReadonlyArray<string>>
): boolean => {
	const specs = pathSpecs(spec);
	if (specs.length === 0) {
		return true;
	}
	return Arr.some(specs, (candidate) =>
		isSkillFilePath(candidate)
			? entryPath === candidate
			: entryPath.startsWith(`${candidate}/`)
	);
};

const inlineHooksFromManifest = (
	definition: PluginDefinition | LoadedPlugin
): Option.Option<HooksSection> => {
	const hooks = definition.manifest.hooks;
	return hooks !== undefined && Schema.is(HooksSection)(hooks)
		? Option.some(hooks)
		: Option.none<HooksSection>();
};

const inlineMcpFromManifest = (
	definition: PluginDefinition | LoadedPlugin
): Option.Option<McpJsonFile> => {
	const mcpServers = definition.manifest.mcpServers;
	if (
		mcpServers === undefined ||
		typeof mcpServers === 'string' ||
		Array.isArray(mcpServers)
	) {
		return Option.none<McpJsonFile>();
	}
	const decoded = Schema.decodeUnknownExit(McpJsonFile)({ mcpServers });
	return Exit.isSuccess(decoded)
		? Option.some(decoded.value)
		: Option.none<McpJsonFile>();
};

const validateFlatEntries = (options: {
	readonly kind: 'command' | 'agent' | 'outputStyle';
	readonly manifestField: Option.Option<string | ReadonlyArray<string>>;
	readonly entries: ReadonlyArray<FlatEntry>;
}): ReadonlyArray<PluginIssue> => {
	const pluralKind = `${options.kind}s`;
	const declaredPaths = pathSpecs(options.manifestField);

	const duplicateNameIssues = Arr.map(
		duplicateValues(Arr.map(options.entries, (entry) => entry.name)),
		(duplicate) =>
			issue({
				code: `duplicate-${options.kind}-name`,
				severity: 'error',
				message: `Duplicate ${options.kind} name \`${duplicate}\`.`
			})
	);

	const duplicatePathIssues = Arr.map(
		duplicateValues(entryPaths(options.entries)),
		(duplicate) =>
			issue({
				code: `duplicate-${options.kind}-path`,
				severity: 'error',
				message: `Duplicate ${options.kind} path \`${duplicate}\`.`,
				path: duplicate
			})
	);

	const ambiguousLayoutIssues =
		declaredPaths.length > 1
			? Arr.map(
					Arr.filter(options.entries, (candidate) =>
						Option.isNone(entryPathOption(candidate))
					),
					(entry) =>
						issue({
							code: `${pluralKind}-layout-ambiguous`,
							severity: 'error',
							message: `${pluralKind} declares multiple target paths, so ${options.kind} \`${entry.name}\` needs an explicit entry.path.`
						})
				)
			: [];

	const invalidPathIssues = Arr.flatMap(options.entries, (entry) =>
		Option.match(entryPathOption(entry), {
			onNone: (): ReadonlyArray<PluginIssue> => [],
			onSome: (entryPath) =>
				entryPath.endsWith('.md')
					? []
					: [
							issue({
								code: `${pluralKind}-path-invalid`,
								severity: 'error',
								message: `${options.kind} \`${entry.name}\` path must point to a markdown file.`,
								path: entryPath
							})
						]
		})
	);

	const outsideLayoutIssues = Arr.flatMap(options.entries, (entry) =>
		Option.match(entryPathOption(entry), {
			onNone: (): ReadonlyArray<PluginIssue> => [],
			onSome: (entryPath) =>
				matchesFlatSpec(entryPath, options.manifestField)
					? []
					: [
							issue({
								code: `${pluralKind}-path-outside-layout`,
								severity: 'error',
								message: `${options.kind} \`${entry.name}\` path falls outside the manifest-declared ${pluralKind} layout.`,
								path: entryPath
							})
						]
		})
	);

	return [
		...duplicateNameIssues,
		...duplicatePathIssues,
		...ambiguousLayoutIssues,
		...invalidPathIssues,
		...outsideLayoutIssues
	];
};

const validateSkillEntries = (
	definition: PluginDefinition | LoadedPlugin
): ReadonlyArray<PluginIssue> => {
	const manifestSkills = Option.fromNullishOr(definition.manifest.skills);
	const declaredPaths = pathSpecs(manifestSkills);

	const duplicateNameIssues = Arr.map(
		duplicateValues(Arr.map(definition.skills, (entry) => entry.name)),
		(duplicate) =>
			issue({
				code: 'duplicate-skill-name',
				severity: 'error',
				message: `Duplicate skill name \`${duplicate}\`.`
			})
	);

	const duplicatePathIssues = Arr.map(
		duplicateValues(entryPaths(definition.skills)),
		(duplicate) =>
			issue({
				code: 'duplicate-skill-path',
				severity: 'error',
				message: `Duplicate skill path \`${duplicate}\`.`,
				path: duplicate
			})
	);

	const ambiguousLayoutIssues =
		declaredPaths.length > 1
			? Arr.map(
					Arr.filter(definition.skills, (candidate) =>
						Option.isNone(entryPathOption(candidate))
					),
					(entry) =>
						issue({
							code: 'skills-layout-ambiguous',
							severity: 'error',
							message: `skills declares multiple target paths, so skill \`${entry.name}\` needs an explicit entry.path.`
						})
				)
			: [];

	const invalidPathIssues = Arr.flatMap(definition.skills, (entry) =>
		Option.match(entryPathOption(entry), {
			onNone: (): ReadonlyArray<PluginIssue> => [],
			onSome: (entryPath) =>
				isSkillFilePath(entryPath)
					? []
					: [
							issue({
								code: 'skills-path-invalid',
								severity: 'error',
								message: `Skill \`${entry.name}\` path must point to a SKILL.md file.`,
								path: entryPath
							})
						]
		})
	);

	const outsideLayoutIssues = Arr.flatMap(definition.skills, (entry) =>
		Option.match(entryPathOption(entry), {
			onNone: (): ReadonlyArray<PluginIssue> => [],
			onSome: (entryPath) =>
				matchesSkillSpec(entryPath, manifestSkills)
					? []
					: [
							issue({
								code: 'skills-path-outside-layout',
								severity: 'error',
								message: `Skill \`${entry.name}\` path falls outside the manifest-declared skills layout.`,
								path: entryPath
							})
						]
		})
	);

	return [
		...duplicateNameIssues,
		...duplicatePathIssues,
		...ambiguousLayoutIssues,
		...invalidPathIssues,
		...outsideLayoutIssues
	];
};

/**
 * Lint a plugin definition and return all errors and warnings without failing.
 *
 * @category Diagnostics
 * @since 0.1.0
 */
export const lint = (
	definition: PluginDefinition | LoadedPlugin
): PluginLintReport => {
	const inlineHooks = inlineHooksFromManifest(definition);
	const inlineMcp = inlineMcpFromManifest(definition);
	const hookSpecs = Option.fromNullishOr(definition.manifest.hooks);
	const mcpSpecs = Option.fromNullishOr(definition.manifest.mcpServers);
	const channels = Option.getOrElse(
		Option.fromNullishOr(definition.manifest.channels),
		() => []
	);
	const servers = Option.match(definition.mcpConfig, {
		onNone: (): ReadonlyArray<string> => [],
		onSome: (config) => Object.keys(config.mcpServers)
	});

	const inlineHookIssues =
		Option.isSome(inlineHooks) && Option.isSome(definition.hooksConfig) &&
		!hooksEquivalence(inlineHooks.value, definition.hooksConfig.value)
			? [
					issue({
						code: 'inline-hooks-mismatch',
						severity: 'error',
						message:
							'manifest.hooks inline config does not match hooksConfig.'
					})
				]
			: [];

	const inlineMcpIssues =
		Option.isSome(inlineMcp) && Option.isSome(definition.mcpConfig) &&
		!mcpEquivalence(inlineMcp.value, definition.mcpConfig.value)
			? [
					issue({
						code: 'inline-mcp-mismatch',
						severity: 'error',
						message:
							'manifest.mcpServers inline config does not match mcpConfig.'
					})
				]
			: [];

	const hookCollapseIssues = Option.match(hookSpecs, {
		onNone: () => [],
		onSome: (spec) =>
			Array.isArray(spec) && spec.length > 1
				? [
						issue({
							code: 'hooks-layout-collapses-on-sync',
							severity: 'warning',
							message:
								'Multiple hook config files are mergeable for load, but Plugin.sync will collapse them to one JSON file for writing.'
						})
					]
				: []
	});

	const mcpCollapseIssues = Option.match(mcpSpecs, {
		onNone: () => [],
		onSome: (spec) =>
			Array.isArray(spec) && spec.length > 1
				? [
						issue({
							code: 'mcp-layout-collapses-on-sync',
							severity: 'warning',
							message:
								'Multiple MCP config files are mergeable for load, but Plugin.sync will collapse them to one JSON file for writing.'
						})
					]
				: []
	});

	const channelIssues = Arr.flatMap(channels, (channel) =>
		Arr.contains(servers, channel.server)
			? []
			: [
					issue({
						code: 'channel-missing-server',
						severity: 'error',
						message: `Channel server \`${channel.server}\` is not present in mcpConfig.`
					})
				]
	);

	return splitIssues([
		...validateFlatEntries({
			kind: 'command',
			manifestField: Option.fromNullishOr(definition.manifest.commands),
			entries: definition.commands
		}),
		...validateFlatEntries({
			kind: 'agent',
			manifestField: Option.fromNullishOr(definition.manifest.agents),
			entries: definition.agents
		}),
		...validateSkillEntries(definition),
		...validateFlatEntries({
			kind: 'outputStyle',
			manifestField: Option.fromNullishOr(definition.manifest.outputStyles),
			entries: definition.outputStyles
		}),
		...inlineHookIssues,
		...inlineMcpIssues,
		...hookCollapseIssues,
		...mcpCollapseIssues,
		...channelIssues
	]);
};

/**
 * Validate a plugin definition and fail when any error-severity issue is found.
 *
 * @category Diagnostics
 * @since 0.1.0
 */
export const validate = (
	definition: PluginDefinition | LoadedPlugin
): Effect.Effect<PluginDefinition | LoadedPlugin, PluginValidationError> => {
	const report = lint(definition);
	return report.errors.length === 0
		? Effect.succeed(definition)
		: Effect.fail(new PluginValidationError({ issues: report.errors }));
};

/**
 * Load a plugin directory from disk and return a structured diagnostic report.
 *
 * @category Diagnostics
 * @since 0.1.0
 */
export const doctor = (
	rootDir: string
): Effect.Effect<PluginDoctorReport, import('../Errors.ts').PluginLoadError, FileSystem.FileSystem | Path.Path> =>
	Effect.fn('Plugin.doctor')(function* (rootDir: string) {
		const scanned = yield* scan(rootDir);
		const loaded = yield* load(rootDir);
		const report = lint(loaded);
		return {
			scanned,
			loaded,
			...report
		};
	})(rootDir);
