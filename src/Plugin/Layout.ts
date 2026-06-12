/**
 * Internal helpers for plugin layout and manifest path normalization.
 *
 * @since 0.1.0
 */
import type { PluginDefinition } from './Define.ts';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';
import * as Str from 'effect/String';

import {
	type ComponentPathSpec,
	ExperimentalSpec,
	type HooksSpec,
	PluginManifest,
	type ServerConfigSpec
} from './Manifest.ts';

const canonicalComponentPaths = {
	commands: 'commands',
	agents: 'agents',
	skills: 'skills',
	outputStyles: 'output-styles'
} as const;

const canonicalConfigPaths = {
	hooks: 'hooks/hooks.json',
	mcpServers: '.mcp.json',
	lspServers: '.lsp.json'
} as const;

const canonicalExperimentalPaths = {
	themes: 'themes',
	monitors: 'monitors/monitors.json'
} as const;

type ComponentKey = keyof typeof canonicalComponentPaths;
type ConfigKey = keyof typeof canonicalConfigPaths;

/** @internal */
export const normalizeManifestPath = (value: string): string => {
	const withoutDotSlash = Str.startsWith('./')(value)
		? Str.slice(2)(value)
		: value;
	const withoutTrailingSlash = Str.replace(/\/+$/, '')(withoutDotSlash);
	return withoutTrailingSlash === '.' ? '' : withoutTrailingSlash;
};

/** @internal */
export const toManifestPath = (value: string): string => {
	const normalized = normalizeManifestPath(value);
	return normalized === '' ? './' : `./${normalized}`;
};

const normalizePathSpecForManifest = (
	spec: string | ReadonlyArray<string>
): string | ReadonlyArray<string> =>
	typeof spec === 'string'
		? toManifestPath(spec)
		: Arr.map(spec, toManifestPath);

const isDefaultComponentSpec = (key: ComponentKey, spec: string): boolean =>
	normalizeManifestPath(spec) === canonicalComponentPaths[key];

const isDefaultConfigSpec = (key: ConfigKey, spec: string): boolean =>
	normalizeManifestPath(spec) === canonicalConfigPaths[key];

const normalizedComponentSpec = (
	spec: Option.Option<ComponentPathSpec>,
	key: ComponentKey
): Option.Option<ComponentPathSpec> => {
	if (Option.isNone(spec)) {
		return Option.none();
	}
	const specValue = spec.value;
	if (typeof specValue === 'string') {
		return isDefaultComponentSpec(key, specValue)
			? Option.none()
			: Option.some(toManifestPath(specValue));
	}
	if (specValue.length === 1 && isDefaultComponentSpec(key, specValue[0] ?? '')) {
		return Option.none();
	}
	return Option.some(normalizePathSpecForManifest(specValue));
};

const keepOrDefaultComponentSpec = (
	spec: Option.Option<ComponentPathSpec>,
	hasEntries: boolean,
	key: ComponentKey
): Option.Option<ComponentPathSpec> =>
	hasEntries ? normalizedComponentSpec(spec, key) : Option.none();

const normalizeServerSpec = (
	spec: Option.Option<ServerConfigSpec>,
	key: ConfigKey
): Option.Option<ServerConfigSpec> =>
	Option.match(spec, {
		onNone: () => Option.none(),
		onSome: (specValue) => {
			if (typeof specValue !== 'string' && !Array.isArray(specValue)) {
				return Option.some(specValue);
			}
			if (typeof specValue === 'string') {
				return isDefaultConfigSpec(key, specValue)
					? Option.none()
					: Option.some(toManifestPath(specValue));
			}
			if (specValue.length === 1 && isDefaultConfigSpec(key, specValue[0] ?? '')) {
				return Option.none();
			}
			return Option.some(normalizePathSpecForManifest(specValue));
		}
	});

const normalizeHooksPathSpec = (
	specValue: string | ReadonlyArray<string>
): Option.Option<HooksSpec> => {
	if (typeof specValue === 'string') {
		return isDefaultConfigSpec('hooks', specValue)
			? Option.none()
			: Option.some(toManifestPath(specValue));
	}
	if (specValue.length === 1 && isDefaultConfigSpec('hooks', specValue[0] ?? '')) {
		return Option.none();
	}
	return Option.some(normalizePathSpecForManifest(specValue));
};

const keepOrDefaultHooksSpec = (
	spec: Option.Option<HooksSpec>,
	hasConfig: boolean
): Option.Option<HooksSpec> =>
	Option.match(spec, {
		onNone: () => Option.none(),
		onSome: (specValue) => {
			if (typeof specValue !== 'string' && !Array.isArray(specValue)) {
				return Option.some(specValue);
			}
			if (!hasConfig) {
				return Option.none();
			}
			if (Array.isArray(specValue) && specValue.length > 1) {
				return Option.some(toManifestPath(canonicalConfigPaths.hooks));
			}
			return normalizeHooksPathSpec(specValue);
		}
	});

const keepOrDefaultServerSpec = (
	spec: Option.Option<ServerConfigSpec>,
	hasConfig: boolean,
	key: ConfigKey
): Option.Option<ServerConfigSpec> =>
	Option.match(spec, {
		onNone: () => Option.none(),
		onSome: (specValue) => {
			if (typeof specValue !== 'string' && !Array.isArray(specValue)) {
				return Option.some(specValue);
			}
			if (!hasConfig) {
				return Option.none();
			}
			if (Array.isArray(specValue) && specValue.length > 1) {
				return Option.some(toManifestPath(canonicalConfigPaths[key]));
			}
			return normalizeServerSpec(Option.some(specValue), key);
		}
	});

const normalizedExperimentalPathSpec = (
	spec: Option.Option<ComponentPathSpec>,
	fallback: string
): Option.Option<ComponentPathSpec> =>
	Option.flatMap(spec, (specValue) => {
		if (typeof specValue === 'string') {
			return normalizeManifestPath(specValue) === fallback
				? Option.none<ComponentPathSpec>()
				: Option.some(toManifestPath(specValue));
		}
		if (specValue.length === 1 && normalizeManifestPath(specValue[0] ?? '') === fallback) {
			return Option.none<ComponentPathSpec>();
		}
		return Option.some(normalizePathSpecForManifest(specValue));
	});

const normalizedExperimentalSpec = (
	spec: Option.Option<ExperimentalSpec>
): Option.Option<ExperimentalSpec> =>
	Option.flatMap(spec, (value) => {
		const themes = normalizedExperimentalPathSpec(
			Option.fromNullishOr(value.themes),
			canonicalExperimentalPaths.themes
		);
		const monitors = normalizedExperimentalPathSpec(
			Option.fromNullishOr(value.monitors),
			canonicalExperimentalPaths.monitors
		);
		if (Option.isNone(themes) && Option.isNone(monitors)) {
			return Option.none<ExperimentalSpec>();
		}
		return Option.some(
			new ExperimentalSpec({
				...(Option.isSome(themes) ? { themes: themes.value } : {}),
				...(Option.isSome(monitors) ? { monitors: monitors.value } : {})
			})
		);
	});

/** @internal */
export const pathSpecs = (
	spec: Option.Option<string | ReadonlyArray<string>>
): ReadonlyArray<string> =>
	Option.match(spec, {
		onNone: () => [],
		onSome: (specValue) =>
			typeof specValue === 'string' ? [specValue] : specValue
	});

/** @internal */
export const isMarkdownFilePath = (path: string): boolean =>
	path.endsWith('.md');

/** @internal */
export const isJsonFilePath = (path: string): boolean =>
	path.endsWith('.json');

/** @internal */
export const isSkillFilePath = (path: string): boolean =>
	/(^|\/)SKILL\.md$/.test(path);

/** @internal */
export const syncManifest = (definition: PluginDefinition): PluginManifest =>
	new PluginManifest({
		name: definition.manifest.name,
		$schema: definition.manifest.$schema,
		version: definition.manifest.version,
		description: definition.manifest.description,
		displayName: definition.manifest.displayName,
		defaultEnabled: definition.manifest.defaultEnabled,
		author: definition.manifest.author,
		homepage: definition.manifest.homepage,
		repository: definition.manifest.repository,
		license: definition.manifest.license,
		keywords: definition.manifest.keywords,
		dependencies: definition.manifest.dependencies,
		experimental: Option.getOrUndefined(
			normalizedExperimentalSpec(
				Option.fromNullishOr(definition.manifest.experimental)
			)
		),
		userConfig: definition.manifest.userConfig,
		channels: definition.manifest.channels,
		commands: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.commands),
				definition.commands.length > 0,
				'commands'
			)
		),
		agents: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.agents),
				definition.agents.length > 0,
				'agents'
			)
		),
		skills: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.skills),
				definition.skills.length > 0,
				'skills'
			)
		),
		outputStyles: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.outputStyles),
				definition.outputStyles.length > 0,
				'outputStyles'
			)
		),
		hooks: Option.getOrUndefined(
			keepOrDefaultHooksSpec(
				Option.fromNullishOr(definition.manifest.hooks),
				Option.isSome(definition.hooksConfig)
			)
		),
		mcpServers: Option.getOrUndefined(
			keepOrDefaultServerSpec(
				Option.fromNullishOr(definition.manifest.mcpServers),
				Option.isSome(definition.mcpConfig),
				'mcpServers'
			)
		),
		lspServers: Option.getOrUndefined(
			keepOrDefaultServerSpec(
				Option.fromNullishOr(definition.manifest.lspServers),
				definition.manifest.lspServers !== undefined,
				'lspServers'
			)
		)
	});
