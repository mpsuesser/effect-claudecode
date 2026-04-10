/**
 * Cross-file plugin validation, linting, and on-disk diagnostics.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as FileSystem from 'effect/FileSystem';
import * as Option from 'effect/Option';
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
	errors: issues.filter((item) => item.severity === 'error'),
	warnings: issues.filter((item) => item.severity === 'warning')
});

const duplicateValues = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.filter(([, count]) => count > 1)
		.map(([value]) => value)
		.sort();
};

const matchesFlatSpec = (
	entryPath: string,
	spec: string | ReadonlyArray<string> | undefined
): boolean => {
	const specs = pathSpecs(spec);
	if (specs.length === 0) {
		return true;
	}
	return specs.some((candidate) =>
		isMarkdownFilePath(candidate)
			? entryPath === candidate
			: entryPath.startsWith(`${candidate}/`)
	);
};

const matchesSkillSpec = (
	entryPath: string,
	spec: string | ReadonlyArray<string> | undefined
): boolean => {
	const specs = pathSpecs(spec);
	if (specs.length === 0) {
		return true;
	}
	return specs.some((candidate) =>
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
	readonly manifestField: string | ReadonlyArray<string> | undefined;
	readonly entries: ReadonlyArray<FlatEntry>;
}): ReadonlyArray<PluginIssue> => {
	const issues: Array<PluginIssue> = [];
	const pluralKind = `${options.kind}s`;

	for (const duplicate of duplicateValues(options.entries.map((entry) => entry.name))) {
		issues.push(
			issue({
				code: `duplicate-${options.kind}-name`,
				severity: 'error',
				message: `Duplicate ${options.kind} name \`${duplicate}\`.`
			})
		);
	}

	for (const duplicate of duplicateValues(
		options.entries.flatMap((entry) => (entry.path !== undefined ? [entry.path] : []))
	)) {
		issues.push(
			issue({
				code: `duplicate-${options.kind}-path`,
				severity: 'error',
				message: `Duplicate ${options.kind} path \`${duplicate}\`.`,
				path: duplicate
			})
		);
	}

	const declaredPaths = pathSpecs(options.manifestField);
	if (declaredPaths.length > 1) {
		for (const entry of options.entries.filter((candidate) => candidate.path === undefined)) {
			issues.push(
				issue({
					code: `${pluralKind}-layout-ambiguous`,
					severity: 'error',
					message: `${pluralKind} declares multiple target paths, so ${options.kind} \`${entry.name}\` needs an explicit entry.path.`
				})
			);
		}
	}

	for (const entry of options.entries) {
		if (entry.path !== undefined && !entry.path.endsWith('.md')) {
			issues.push(
				issue({
					code: `${pluralKind}-path-invalid`,
					severity: 'error',
					message: `${options.kind} \`${entry.name}\` path must point to a markdown file.`,
					path: entry.path
				})
			);
		}
		if (entry.path !== undefined && !matchesFlatSpec(entry.path, options.manifestField)) {
			issues.push(
				issue({
					code: `${pluralKind}-path-outside-layout`,
					severity: 'error',
					message: `${options.kind} \`${entry.name}\` path falls outside the manifest-declared ${pluralKind} layout.`,
					path: entry.path
				})
			);
		}
	}

	return issues;
};

const validateSkillEntries = (definition: PluginDefinition | LoadedPlugin): ReadonlyArray<PluginIssue> => {
	const issues: Array<PluginIssue> = [];

	for (const duplicate of duplicateValues(definition.skills.map((entry) => entry.name))) {
		issues.push(
			issue({
				code: 'duplicate-skill-name',
				severity: 'error',
				message: `Duplicate skill name \`${duplicate}\`.`
			})
		);
	}

	for (const duplicate of duplicateValues(
		definition.skills.flatMap((entry) => (entry.path !== undefined ? [entry.path] : []))
	)) {
		issues.push(
			issue({
				code: 'duplicate-skill-path',
				severity: 'error',
				message: `Duplicate skill path \`${duplicate}\`.`,
				path: duplicate
			})
		);
	}

	const declaredPaths = pathSpecs(definition.manifest.skills);
	if (declaredPaths.length > 1) {
		for (const entry of definition.skills.filter((candidate) => candidate.path === undefined)) {
			issues.push(
				issue({
					code: 'skills-layout-ambiguous',
					severity: 'error',
					message: `skills declares multiple target paths, so skill \`${entry.name}\` needs an explicit entry.path.`
				})
			);
		}
	}

	for (const entry of definition.skills) {
		if (entry.path !== undefined && !isSkillFilePath(entry.path)) {
			issues.push(
				issue({
					code: 'skills-path-invalid',
					severity: 'error',
					message: `Skill \`${entry.name}\` path must point to a SKILL.md file.`,
					path: entry.path
				})
			);
		}
		if (entry.path !== undefined && !matchesSkillSpec(entry.path, definition.manifest.skills)) {
			issues.push(
				issue({
					code: 'skills-path-outside-layout',
					severity: 'error',
					message: `Skill \`${entry.name}\` path falls outside the manifest-declared skills layout.`,
					path: entry.path
				})
			);
		}
	}

	return issues;
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
	const issues: Array<PluginIssue> = [
		...validateFlatEntries({
			kind: 'command',
			manifestField: definition.manifest.commands,
			entries: definition.commands
		}),
		...validateFlatEntries({
			kind: 'agent',
			manifestField: definition.manifest.agents,
			entries: definition.agents
		}),
		...validateSkillEntries(definition),
		...validateFlatEntries({
			kind: 'outputStyle',
			manifestField: definition.manifest.outputStyles,
			entries: definition.outputStyles
		})
	];

	const inlineHooks = inlineHooksFromManifest(definition);
	if (Option.isSome(inlineHooks) && Option.isSome(definition.hooksConfig)) {
		if (!hooksEquivalence(inlineHooks.value, definition.hooksConfig.value)) {
			issues.push(
				issue({
					code: 'inline-hooks-mismatch',
					severity: 'error',
					message: 'manifest.hooks inline config does not match hooksConfig.'
				})
			);
		}
	}

	const inlineMcp = inlineMcpFromManifest(definition);
	if (Option.isSome(inlineMcp) && Option.isSome(definition.mcpConfig)) {
		if (!mcpEquivalence(inlineMcp.value, definition.mcpConfig.value)) {
			issues.push(
				issue({
					code: 'inline-mcp-mismatch',
					severity: 'error',
					message: 'manifest.mcpServers inline config does not match mcpConfig.'
				})
			);
		}
	}

	if (Array.isArray(definition.manifest.hooks) && definition.manifest.hooks.length > 1) {
		issues.push(
			issue({
				code: 'hooks-layout-collapses-on-sync',
				severity: 'warning',
				message: 'Multiple hook config files are mergeable for load, but Plugin.sync will collapse them to one JSON file for writing.'
			})
		);
	}

	if (
		Array.isArray(definition.manifest.mcpServers) &&
		definition.manifest.mcpServers.length > 1
	) {
		issues.push(
			issue({
				code: 'mcp-layout-collapses-on-sync',
				severity: 'warning',
				message: 'Multiple MCP config files are mergeable for load, but Plugin.sync will collapse them to one JSON file for writing.'
			})
		);
	}

	const servers = Option.isSome(definition.mcpConfig)
		? new Set(Object.keys(definition.mcpConfig.value.mcpServers))
		: new Set<string>();
	for (const channel of definition.manifest.channels ?? []) {
		if (!servers.has(channel.server)) {
			issues.push(
				issue({
					code: 'channel-missing-server',
					severity: 'error',
					message: `Channel server \`${channel.server}\` is not present in mcpConfig.`
				})
			);
		}
	}

	return splitIssues(issues);
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
