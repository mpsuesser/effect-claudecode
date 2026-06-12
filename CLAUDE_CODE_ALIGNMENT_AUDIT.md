# Claude Code alignment audit — effect-claudecode

**Date:** 2026-06-12 · **Library last updated:** 2026-04-12 · **Validated against:** official docs at code.claude.com (current line ≈ v2.1.175, matching the locally installed CLI) and the anthropics/claude-code CHANGELOG.

**Method:** 9 surfaces audited. Per surface: one agent inventoried what the library encodes (source + test fixtures), one researched the current official docs/changelog, one cross-checked the two inventories. Every finding was then adversarially verified — the 45 highest-impact ones by independent docs-lens and code-lens verifier pairs (including empirical decode tests against effect@4.0.0-beta.46 and end-to-end runs of Hook.runMain under bun), the rest by per-surface batch verifiers with live doc fetches. 139 raw findings → 104 confirmed unique findings, 33 cross-surface duplicates merged, 2 refuted (one additional refutation was itself overturned by a direct doc fetch — see the suppressOriginalPrompt finding).

**Current verdict: the library is still NOT fully aligned with Claude Code.** The original P0 hook/plugin/frontmatter/settings drift is mostly closed, and effective MCP scope loading is now implemented. Remaining drift is concentrated in plugin layout/emission fidelity, FileChanged matcher semantics, residual stale comments/examples, and missing focused tests for newly modeled surface.

## Current implementation status — 2026-06-12

**Code baseline assessed:** `752af9b feat(mcp): load effective server scopes`.
That slice added effective MCP loading across plugin, user, project, local, and
managed scopes, plus reserved-name and legacy-authorization emission handling.

**Validation:** `bun run typecheck && bun run test` is green on the assessed
baseline. Latest run: `21` test files, `213` tests.

**Live docs rechecked during status review:** raw markdown for hooks,
plugins-reference, settings, and MCP from `https://code.claude.com/docs/en/*.md`.
The live hooks docs currently state that `FileChanged` uses `event` with values
`change | add | unlink`; the older refutation at the bottom of this audit is
therefore obsolete.

**Current verdict:** the library is still not completely aligned with current
Claude Code, but the highest-risk P0 hook/plugin/frontmatter/settings/MCP drift
is largely closed. The remaining alignment work is concentrated in plugin
layout/emission fidelity, a few matcher/comment/test residuals, and
docs/examples cleanup.

### Current status by surface

| Surface | Status | Notes |
|---|---:|---|
| Hook event input/output schemas | Mostly done | All 30 current events are modeled. Most P0/P1 field renames and output additions are implemented. |
| Hook runner and testing harness | Mostly done | Handler-controlled raw stdout/stderr and exit-code paths are implemented; `runHookWithMockStdin` preserves raw stdout. Some comments/JSDoc still overstate old semantics. |
| Tool adapters | Mostly done | Current Bash/Read shapes and common built-in tools are modeled. Coverage can still expand for less-common tools. |
| Matcher semantics | Partial | Standard matcher semantics are mostly implemented. `FileChanged` needs a targeted recheck: docs say literal filenames build the watch list, but filtering uses standard matcher rules against the basename. |
| Settings schema and loader | Partial but much improved | CLI `--settings`, file-based managed settings, raw retention, and field-aware merges are implemented. Plist/registry/server-managed tiers are not. Full settings-key coverage is not guaranteed. |
| Settings hooks section | Mostly done | Per-handler `if`, `args`, `asyncRewake`, common handler fields, and `mcp_tool` are modeled. HTTP `allowedEnvVars` is current and should remain. |
| MCP schema | Mostly done | `stdio` without `type`, `ws`, `streamable-http`, `oauth`, `headersHelper`, and `alwaysLoad` are modeled. Legacy `authorization` remains decodable for compatibility but is omitted from emitted current config. |
| MCP scope loading | Mostly done | Effective loading now covers plugin, user, project, local, and `managed-mcp.json` scopes with documented precedence; `workspace` servers are skipped from loaders/emission. |
| Plugin manifest/marketplace/frontmatter | Mostly done | Current manifest/userConfig/marketplace/frontmatter P0/P1 schema drift is mostly fixed. |
| Plugin layout and emission | Partial/open | `themes/`, `monitors/`, `bin/`, plugin-root `settings.json`, `.lsp.json` fallback, `./` path normalization, and skill-path de-dupe still need work. |
| README/examples/docs comments | Open | Several examples still use unquoted `${CLAUDE_PLUGIN_ROOT}`; some docs comments are stale. |

### Completed since the original audit

#### Hook events, runner, tool adapters, and tests

- `PermissionRequest` now accepts object-shaped permission suggestion rules and
  emits current `updatedPermissions` variants; deny decisions support
  `interrupt`.
- `SessionEnd`, `StopFailure`, `ConfigChange`, `Elicitation`,
  `ElicitationResult`, `CwdChanged`, and `FileChanged` inputs now use current
  field names and expose current event-specific fields.
- `Notification` current notification types are modeled, and the old
  Notification-specific `additionalContext` helper is deprecated in favor of
  common output fields.
- `WorktreeCreate.created()` now emits raw stdout for command hooks, while an
  HTTP-style helper remains available for JSON `hookSpecificOutput` output.
- `TeammateIdle.keepWorking()`, `TaskCreated.block()`, and
  `TaskCompleted.block()` now use handler-controlled exit-2 stderr paths; the
  old JSON stop-teammate behavior is exposed separately.
- `PreToolUse` has a true neutral `passthrough()` helper, non-matching
  `onTool`/`onMatcher`/`onAdapter` paths no longer auto-allow, and `defer()`
  documentation describes headless suspend/resume semantics.
- `PostToolUse` and `PostToolUseFailure` expose `duration_ms`; `PostToolUse`
  supports universal `updatedToolOutput`.
- Universal `terminalSequence` output is present across modeled event outputs.
- `PreCompact`, `PostCompact`, `Stop`, `SubagentStop`, `SessionStart`, and
  `UserPromptSubmit` have the current notable input/output additions.
- The four previously missing events are added and exported: `Setup`,
  `UserPromptExpansion`, `PostToolBatch`, and `MessageDisplay`.
- Common envelope/context fields `effort`, `agent_id`, and `agent_type` are
  modeled and exposed through `HookContext`.
- Tool adapters now cover current Bash/Read shapes plus Write, Edit, Glob,
  Grep, WebFetch, WebSearch, Agent, AskUserQuestion, and ExitPlanMode.
- `Testing.fixtures` stale defaults were corrected, and
  `runHookWithMockStdin` no longer assumes stdout is always JSON.

#### Settings and hook configuration

- `Settings.load` now reads user, project, local, optional CLI overlay, and
  file-based managed settings roots/drop-ins in the correct implemented order.
- Known array/object settings are merged with field-aware semantics instead of
  a shallow top-level replace; permission arrays, hook groups, sandbox arrays,
  plugin records, HTTP hook allowlists, and related arrays are preserved/merged.
- Decoded `SettingsFile.raw` preserves source JSON keys so newly added Claude
  Code settings are not completely lost before first-class fields are added.
- Major current settings fields are modeled, including sandbox, attribution,
  language, effort/model fields, HTTP hook allowlists, plugin policy/config
  fields, managed MCP policy settings, worktree, and several recent UI flags.
- `apiKeyHelper` accepts the current string script-path form while retaining a
  deprecated object fallback.
- `extraKnownMarketplaces` supports current source variants and `autoUpdate`.
- `statusLine.refreshInterval` is modeled and the undocumented `disabled`
  status-line type was removed.
- Hook handler config now models per-handler `if`, `args`, `asyncRewake`,
  `statusMessage`, `once`, and `mcp_tool`.
- Live docs confirm per-HTTP-hook `allowedEnvVars` and top-level
  `httpHookAllowedEnvVars` are current, so those fields should remain.

#### Plugin, marketplace, and frontmatter

- `hooks/hooks.json` load accepts both documented wrapped files and legacy bare
  `HooksSection` files; write emits the documented `{ "hooks": ... }` wrapper.
- Plugin manifest schema now preserves current fields such as `$schema`,
  `displayName`, `defaultEnabled`, `dependencies`, `experimental`,
  `lspServers`, and current component path specs.
- `UserConfigEntry` models required `type`, `title`, and `description`, plus
  current optional fields.
- Marketplace schema includes current source variants (`url`, `git-subdir`,
  `npm`), GitHub `sha` / `skipLfs`, required owner, metadata, cross-marketplace
  policy, and plugin entry metadata/component fields.
- Skill and output-style frontmatter names are optional and fall back to the
  directory/file basename where appropriate.
- Current frontmatter fields are modeled across skills, commands, output styles,
  and subagents, including `xhigh` effort, skill `paths` string-or-array,
  `disallowed-tools`, `when_to_use`, `arguments`, output-style
  `keep-coding-instructions` / `force-for-plugin`, subagent `mcpServers`,
  `color`, and `initialPrompt`.
- Root-level `SKILL.md` discovery is implemented.
- `commands/` is documented in source as the legacy skill-style command form.

#### MCP

- `.mcp.json` schema accepts omitted stdio `type`, `streamable-http`, `ws`,
  `headersHelper`, `alwaysLoad`, and current `oauth` objects.
- MCP environment-variable expansion is documented as pass-through syntax.
- Effective MCP loading now reads `~/.claude.json` user and local project
  scopes, project `.mcp.json`, plugin-provided configs, and system
  `managed-mcp.json` with the documented precedence/exclusive managed behavior.
- MCP loaders and emission skip the reserved `workspace` server name.
- Current MCP emission omits legacy `authorization` blocks in favor of `oauth`
  plus `headers` / `headersHelper`; the legacy field remains decodable only for
  source compatibility.

### Remaining work

#### P0 / P1 — finish alignment

- **Plugin layout components are still partial/open.** Scan/write/preserve
  `themes/`, `monitors/`, `bin/`, and plugin-root `settings.json`.
- **LSP fallback is still partial.** `lspServers` is preserved, but default
  `.lsp.json` discovery/loading is not complete.
- **Plugin manifest emitted paths are still stale.** Defaults still emit bare
  strings in some paths; either omit default component fields or emit documented
  `./`-prefixed relative paths.
- **Skill path de-duplication remains open.** Default `skills/` and declared
  skill paths are now additive, but duplicates should be normalized away.
- **FileChanged matcher semantics need a targeted fix/test.** Current docs say
  literal segments build the watch list, but standard matcher rules filter the
  changed basename. Current helper behavior appears too literal for filtering.

#### P2 / P3 — polish and coverage

- Add stronger dedicated tests for the four newly modeled hook events and for
  newly added settings/hook-entry fields (`mcp_tool`, per-handler `if`, `args`,
  `asyncRewake`, raw settings retention, sandbox, marketplace variants, etc.).
- Tighten or document deliberate openness for skill/subagent constraints:
  skill name/description spec constraints, subagent name pattern, and subagent
  `memory` enum.
- Keep body substitution parsing explicitly out of scope or document the current
  opaque pass-through behavior more clearly.
- Update README/examples to quote `${CLAUDE_PLUGIN_ROOT}` in shell-form hook
  commands.
- Clean stale source comments/JSDoc, especially runner exit-code summaries,
  `Errors.ts` decode-failure wording, and PostToolUse replacement helper docs.

### Immediate next steps

1. Start from the clean code baseline `752af9b` and rerun:

   ```sh
   bun run typecheck && bun run test
   ```

2. Work the remaining open items in this order:

   1. Plugin layout/emission fidelity.
   2. FileChanged matcher behavior and residual hook comments/tests.
   3. README/examples and stricter optional validation/doc polish.

3. Add fixture tests as each remaining contract is fixed.
4. Keep this status section authoritative over the historical findings below;
   the detailed finding list remains the original audit backlog and may still
   contain stale “Library:” descriptions for items already fixed.

## Instructions for the fixing agent

This document is the work order: each finding is a task, and the sections are ordered by priority.

1. **Baseline first.** Run `bun run test && bun run typecheck` before changing anything and confirm green. The audit's empirical claims were validated against `effect@4.0.0-beta.46`; if the repo has since moved to a newer Effect beta, the contracts below are unchanged (they describe Claude Code's wire formats, not Effect's API), but adapt any `Schema.*` idioms in the fix suggestions to the current Effect API.
2. **Work one priority tier at a time** (P0 → P1 → P2 → P3), module by module within a tier. Run `bun run test && bun run typecheck` after each module; commit at least once per tier.
3. **Every input-schema change needs a fixture test** that decodes the documented payload verbatim (quoted in the finding's "Current" line, or at the cited URL). Update `Testing.fixtures` in the same change so the testing harness stops emitting stale shapes (see the Testing finding under P2).
4. **Ground truth is the cited doc page, not this file.** Where a finding carries an explicit caveat ("could not be fully evidenced", "confirm placement empirically"), fetch the cited URL before coding — appending `.md` to a docs path (e.g. `code.claude.com/docs/en/hooks.md`) returns raw markdown that is easy to grep. Resolve caveats from the live page; never guess.
5. **Previously unmodeled events** (Setup, UserPromptExpansion, PostToolBatch, MessageDisplay) now have source modules. If touching them again, fetch the live hooks reference and add focused fixture tests for their complete input/output schemas.
6. **Schema philosophy:** inputs stay open and tolerant — unknown fields ignored, prefer optional unless the docs mark a field required. A too-strict input schema is the worst failure mode in this audit: a decode failure exits 2, which on several events has destructive side effects (denies permissions, blocks config changes). Outputs emit only documented fields.
7. **Scope:** the "Additional risks" section now lists active residual risks, not merely deferred feature work. The "Checked and refuted" section requires no changes unless new live-doc evidence contradicts it. If you intentionally skip a finding, say so in your summary instead of dropping it silently.

## P0 — Breaking: decode failures, wrong emissions, inverted semantics

### Hook events

- **PermissionRequest input rejects current permission_suggestions payloads (rules typed as string[] instead of object[]), causing exit 2 which denies the permission**  
  `src/Hook/Events/PermissionRequest.ts` · dual-lens verified (docs + code)
  - Library: PermissionSuggestion.rules is Schema.optional(Schema.Array(Schema.String)) (src/Hook/Events/PermissionRequest.ts:35). Empirically verified: decoding rules: [{toolName: 'Bash', ruleContent: 'rm -rf node_modules'}] fails with 'Expected string, got {…}'. A failed input decode raises HookInputDecodeError, which hookTeardown maps to exit code 2 (src/Hook/Runner.ts:290).
  - Current: The hooks reference (https://code.claude.com/docs/en/hooks) shows permission_suggestions entries with rules as an array of objects: "rules": [{ "toolName": "Bash", "ruleContent": "rm -rf node_modules" }]. The exit-code table states exit 2 on PermissionRequest "Denies the permission". So any PermissionRequest fired with suggestions (the common case — they are the 'always allow' options the user would see) makes the library hook silently deny the permission.
  - Fix: Change PermissionSuggestion.rules to Schema.optional(Schema.Array(Schema.Struct({ toolName: Schema.String, ruleContent: Schema.optional(Schema.String) }))) — or a loose Record fallback — and add a test fixture using the documented object-shaped rules. Also consider downgrading input-decode failures on non-blocking events to exit 1.

- **PermissionRequest output PermissionUpdate cannot express valid permission updates (no rules, mode, or directories fields)**  
  `src/Hook/Events/PermissionRequest.ts` · dual-lens verified (docs + code)
  - Library: PermissionUpdate has only type (closed enum of 6), optional behavior, and required destination (src/Hook/Events/PermissionRequest.ts:71-89). There is no way to attach the rules array for addRules/replaceRules/removeRules, the mode for setMode, or the directories array for addDirectories/removeDirectories — the Schema.Class constructor rejects extra properties at the type level, so allow({updatedPermissions}) (lines 121-134) can only emit payload-less updates.
  - Current: Per the hooks reference (https://code.claude.com/docs/en/hooks), updatedPermissions entries require per-type payloads: addRules takes rules: [{toolName, ruleContent?}] plus behavior, setMode takes mode (default/auto/acceptEdits/dontAsk/bypassPermissions/plan), addDirectories/removeDirectories take a directories string array (capability added v2.0.54 per CHANGELOG, https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md). An addRules entry with no rules is an update Claude Code cannot apply.
  - Fix: Model PermissionUpdate as a discriminated union on type: addRules/replaceRules/removeRules variants with rules: Array({toolName, ruleContent?}) and behavior; setMode variant with mode; addDirectories/removeDirectories variants with directories: Array(String). Share the rule-entry schema with the input-side PermissionSuggestion so hooks can echo suggestions back as updatedPermissions, as the docs describe.

### Plugin system

- **hooks/hooks.json written without the documented top-level "hooks" wrapper, and the wrapped form is rejected on load**  
  `src/Plugin/Define.ts` · batch verified (high)
  - Library: Plugin.write emits the bare HooksSection (event-name keys at top level) to hooks/hooks.json (src/Plugin/Define.ts:723-726; verified output `{"PostToolUse": [...]}`), and Plugin.load decodes hooks files directly against HooksSection (src/Plugin/Load.ts:176-186, 136-157). Empirically, decoding the documented wrapped payload `{"hooks": {"PostToolUse": [...]}}` fails with 'Expected array, got {...}'.
  - Current: Plugin hooks use 'the same format as settings hooks'; the documented hooks/hooks.json shape is `{"hooks": {"PostToolUse": [{"matcher": "Write|Edit", "hooks": [{"type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh"}]}]}}`, and a malformed hooks/hooks.json prevents the entire plugin from loading (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Emit the documented wrapped form `{"hooks": {...}}` in Plugin.write, and make readHooksFile/readOptionalHooks (src/Plugin/Load.ts) accept both shapes by unwrapping an optional top-level "hooks" key before decoding HooksSection.

- **UserConfigEntry models an obsolete shape — missing required type/title/description and all other current option fields**  
  `src/Plugin/Manifest.ts` · batch verified (high)
  - Library: src/Plugin/Manifest.ts:100-105 defines UserConfigEntry as only `description?: string` and `sensitive?: boolean`. Empirically, decoding `{type: 'string', title: 'API token', description: 'd', sensitive: true}` succeeds but silently strips type and title, so Plugin.load → write round-trips emit userConfig entries that lack the required fields, and the typed API cannot express a valid entry at all.
  - Current: Each userConfig option requires `type` (one of string, number, boolean, directory, file), `title`, and `description`; optional fields are `sensitive`, `required`, `default`, `multiple`, `min`, `max`. Values substitute via ${user_config.KEY} and export as CLAUDE_PLUGIN_OPTION_<KEY> (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Rewrite UserConfigEntry with required `type` (literal union string|number|boolean|directory|file), `title`, `description`, and optional `sensitive`, `required`, `default`, `multiple`, `min`, `max`. The same record is reused by ChannelSpec.userConfig (Manifest.ts:133-136), so fixing it covers channels too.

- **Marketplace plugin source union rejects current url/git-subdir/npm sources, silently drops github sha, and encodes a directory-object variant the docs no longer list**  
  `src/Plugin/Marketplace.ts` · batch verified (high)
  - Library: src/Plugin/Marketplace.ts:57-61 unions only raw string, DirectoryPluginSource ({source:'directory', path}, lines 27-32), and GithubPluginSource ({source:'github', repo, ref?}, lines 41-47). Empirically: `{source:'npm', package:...}`, `{source:'url', url:...}`, and `{source:'git-subdir', url, path}` all fail decode ('Expected MarketplacePluginSourceSpec'); `{source:'github', repo, sha}` decodes but the sha pin is silently stripped.
  - Current: Current plugin source variants are: relative path string (must start with ./), github {repo, ref?, sha?}, url {url, ref?, sha?}, git-subdir {url, path, ref?, sha?}, and npm {package, version?, registry?}; when both ref and sha are set, sha is the effective pin, and github/git sources accept skipLfs (v2.1.153+). No `{source:'directory'}` object variant is documented for marketplace plugin entries (https://code.claude.com/docs/en/plugin-marketplaces).
  - Fix: Add UrlPluginSource, GitSubdirPluginSource, and NpmPluginSource classes to the union; add `sha` and `skipLfs` to GithubPluginSource; mark or remove DirectoryPluginSource (express local dirs as relative-path strings per current docs).

### Frontmatter

- **SkillFrontmatter requires `name`, but current Claude Code falls back to the directory basename when frontmatter name is absent**  
  `src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: src/Frontmatter/Skill.ts:41-46 declares `name: Schema.String` as required, and Plugin.load takes skill names from `parsed.frontmatter.name` (src/Plugin/Load.ts:520-527), so loading a SKILL.md without a frontmatter `name` fails with PluginLoadError.
  - Current: Skill invocation name comes from frontmatter `name` with fallback to the directory basename (documented for skills dirs, e.g. `"skills": ["./"]` pointing at a dir containing SKILL.md directly), so SKILL.md files without a frontmatter name are valid (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Make `name` optional in SkillFrontmatter and have Plugin.load fall back to the containing directory's basename when frontmatter name is missing.

### Other

- **SessionEnd input requires `exit_reason` but Claude Code sends `reason`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/SessionEnd.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/SessionEnd.ts:35 declares `exit_reason: ExitReason` as a required field on the Input schema, and the matcher selector reads `input.exit_reason` (SessionEnd.ts:91). The doc comment (SessionEnd.ts:4-5) says the matcher is on `exit_reason`.
  - Current: The current SessionEnd input field is `reason` (string enum: clear, resume, logout, prompt_input_exit, bypass_permissions_disabled, other) per https://code.claude.com/docs/en/hooks#sessionend — the JSON example shows `"reason": "other"` and no `exit_reason` key. Enum values themselves match the library.
  - Fix: Rename the schema field from `exit_reason` to `reason` (keep the existing ExitReason literals, which are current), update the matcher selector to `input.reason`, and update fixtures in test/Hook/Events/Tier1.test.ts:248-254. As-is, every real SessionEnd payload fails decode (required key absent), the handler never runs, and the runner exits 2.

- **StopFailure input uses `error_type`/`error_message` but Claude Code sends `error`/`error_details`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/StopFailure.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/StopFailure.ts:34 declares required `error_type: ErrorType` and StopFailure.ts:35 declares optional `error_message`; the matcher selects on `input.error_type` (StopFailure.ts:79).
  - Current: The discriminant field is `error` (not `error_type`) and the optional detail field is `error_details`, per https://code.claude.com/docs/en/hooks#stopfailure-input (example: {"error": "rate_limit", "error_details": "429 Too Many Requests", "last_assistant_message": "API Error: Rate limit reached"}). Docs explicitly note third-party pages using `error_type` are wrong. StopFailure also carries optional `last_assistant_message` containing the API error string.
  - Fix: Rename `error_type` to `error` and `error_message` to `error_details`, update the matcher selector, and add optional `last_assistant_message: Schema.optional(Schema.String)`. As-is, every real StopFailure payload fails decode (required `error_type` absent) and the handler never runs.

- **StopFailure error enum missing `overloaded`, `oauth_org_not_allowed`, `model_not_found`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/StopFailure.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/StopFailure.ts:20-28 closes the enum to exactly: rate_limit, authentication_failed, billing_error, invalid_request, server_error, max_output_tokens, unknown (Schema.Literals rejects any other value).
  - Current: Current matcher/enum values for StopFailure's `error` field are: rate_limit, overloaded, authentication_failed, oauth_org_not_allowed, billing_error, invalid_request, model_not_found, server_error, max_output_tokens, unknown — per https://code.claude.com/docs/en/hooks#stopfailure.
  - Fix: Add 'overloaded', 'oauth_org_not_allowed', and 'model_not_found' to the ErrorType literals (and consider a string fallback so future enum additions degrade gracefully instead of failing decode). Once the field rename (error_type→error) is fixed, payloads with these three values would still be rejected by the closed enum.

- **Notification `notification_type` enum missing `elicitation_complete` and `elicitation_response`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/Notification.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/Notification.ts:24-29 closes NotificationType to exactly: permission_prompt, idle_prompt, auth_success, elicitation_dialog. Unknown values are rejected at decode (confirmed by test/Hook/Events/Tier1.test.ts:131-140, which asserts decode failure on an unknown type).
  - Current: Current notification_type values are: permission_prompt, idle_prompt, auth_success, elicitation_dialog, elicitation_complete, elicitation_response — per https://code.claude.com/docs/en/hooks#notification.
  - Fix: Add 'elicitation_complete' and 'elicitation_response' to the NotificationType literals. As-is, hooks registered without a settings.json matcher receive these payloads and the library exits 2 on decode failure instead of running the handler.

- **Notification `addContext()` emits `hookSpecificOutput.additionalContext`, which current Claude Code does not honor for Notification**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/Notification.ts` · batch verified (high)
  - Library: src/Hook/Events/Notification.ts:46-59 models a HookSpecificOutput ({hookEventName: 'Notification', additionalContext}) on the Output schema, and `addContext()` (Notification.ts:80-86) emits it. The module doc comment (Notification.ts:6-7) says the hook 'may annotate it via additionalContext'.
  - Current: The current docs decision-pattern table places Notification under 'None (side effects only)' — context injection via hookSpecificOutput.additionalContext is documented only for SessionStart, SubagentStart, and Setup. Notification hooks are 'intended for side effects such as forwarding the notification to an external service'; only common output fields (systemMessage, terminalSequence, etc.) apply. https://code.claude.com/docs/en/hooks#notification
  - Fix: Remove or deprecate `addContext()` and the HookSpecificOutput class on Notification (or document that Claude Code silently ignores it), and fix the module doc comment. Emitted output is silently ignored, so users believe they are annotating notifications when nothing happens.

- **ConfigChange input field is `source`, not `config_source` — every ConfigChange payload fails decode and exit 2 then BLOCKS the config change**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/ConfigChange.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/ConfigChange.ts:33 requires `config_source: ConfigSource` on Input; the onMatcher selector reads `input.config_source` (ConfigChange.ts:82). On decode failure the runner exits 2 (src/Hook/Runner.ts:290, documented at Runner.ts:273-275 as 'blocking error').
  - Current: Current docs (https://code.claude.com/docs/en/hooks#configchange, fetched 2026-06-12) show the field as `source` (values user_settings|project_settings|local_settings|policy_settings|skills) plus an optional `file_path`, e.g. {"hook_event_name":"ConfigChange","source":"project_settings","file_path":"...settings.json"}. Exit code 2 blocks the config change from applying (except policy_settings).
  - Fix: Rename the Input field to `source` (keep the same 5-value enum, which matches the current matcher values), add `file_path: Schema.optional(Schema.String)`, and update the onMatcher selector to `input.source`. Note the failure mode is severe: because real payloads carry `source` not `config_source`, decode always fails, the runner exits 2, and Claude Code interprets exit 2 on ConfigChange as 'block this config change' — so any hook built with this module silently blocks all non-policy config changes.

- **WorktreeCreate contract wrong on both sides: input is `name` (slug), and command hooks must print a plain path to stdout — the library's JSON hookSpecificOutput form fails worktree creation**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/WorktreeCreate.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/WorktreeCreate.ts:25-26 models optional `worktree_path`/`git_repo_path` inputs (neither exists; handler can never see the worktree slug). The `created(worktreePath)` helper (WorktreeCreate.ts:52-58) emits {"hookSpecificOutput":{"hookEventName":"WorktreeCreate","worktreePath":...}} as a JSON line on stdout, with the file header (lines 4-9) acknowledging command hooks 'traditionally print the worktree path to stdout' but choosing 'the JSON form'. Runner exit-code mapping treats only exit 2 as blocking (Runner.ts:273-278).
  - Current: Current docs (https://code.claude.com/docs/en/hooks#worktreecreate, fetched 2026-06-12): input is `name` (the slug for the new worktree, e.g. "feature-auth"). Output contract: command hooks print the absolute worktree path on stdout; only HTTP hooks return the hookSpecificOutput.worktreePath JSON. A missing/invalid path fails creation, and ANY non-zero exit code (not just 2) aborts creation. HTTP-type support added 2.1.84 per changelog.
  - Fix: Replace the Input extras with `name: Schema.String` (drop worktree_path/git_repo_path). Make `created(worktreePath)` write the bare absolute path (no JSON) to stdout for this event — this requires a per-event raw-stdout escape hatch in Runner.ts, since this library runs as a command hook where the JSON envelope is not a valid path and creation fails. Also note for this event the runner's exit-1 'non-blocking' convention does not hold: any non-zero exit aborts creation.

- **TeammateIdle.keepWorking() does the opposite of its name: {continue:false} stops the teammate entirely; keeping it working requires exit 2 + stderr**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/TeammateIdle.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/TeammateIdle.ts:38-45: `keepWorking(reason)` returns `new Output({ continue: false, stopReason: reason })`, documented as 'Prevent the teammate from going idle by setting continue: false' (and the file header lines 4-5 says a handler 'can prevent idle by returning continue: false').
  - Current: Current docs (https://code.claude.com/docs/en/hooks#teammateidle, fetched 2026-06-12): exit code 2 makes the teammate CONTINUE working with stderr as feedback; JSON {"continue": false, "stopReason": "..."} STOPS the teammate entirely. The library's emitted JSON is accepted by Claude Code but performs the inverse of the helper's stated intent.
  - Fix: Rename/repurpose: `keepWorking` must be implemented as an exit-2 path with the reason on stderr (the runner currently only exits 2 on decode failure, Runner.ts:283-292, so add a typed 'block via exit 2' result), and the current {continue:false} output should be exposed as something like `stopTeammate(reason)`. Fix the header doc accordingly.

- **settings.json `if` is modeled on the matcher group instead of per hook handler**  
  `/Users/m/repos/effect-claudecode/src/Settings/HooksSection.ts` · batch verified (high)
  - Library: src/Settings/HooksSection.ts:99-105 puts `if: Schema.optional(Schema.String)` on HookMatcherGroup; none of CommandHookEntry/HttpHookEntry/PromptHookEntry/AgentHookEntry (HooksSection.ts:32-70) carry an `if` field
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks) defines `if` (added v2.1.85 per https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) as a common per-handler field alongside type/timeout. A group-level `if` emitted by the library is ignored by Claude Code (filter silently never applies), and a correct handler-level `if` is stripped when the library re-encodes settings (e.g. plugin hooks sync), losing user configuration.
  - Fix: Move `if` onto each hook entry class (common field of the discriminated union) and drop or deprecate the group-level `if`.

- **apiKeyHelper modeled as object but current Claude Code defines it as a string script path**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:116-121 defines ApiKeyHelperConfig as an object { executable?: string, timeout?: number }, wired at src/Settings/Schema.ts:170 (apiKeyHelper: Schema.optional(ApiKeyHelperConfig)). Probe confirmed: decoding { "apiKeyHelper": "/bin/get-key.sh" } fails, raising SettingsDecodeError and aborting the whole Settings.load merge (src/Settings/Loader.ts:79-84, 205-211).
  - Current: apiKeyHelper is a string — a script path executed in /bin/sh whose output is sent as X-Api-Key and Authorization: Bearer; TTL configured via CLAUDE_CODE_API_KEY_HELPER_TTL_MS env var, not a timeout field (https://code.claude.com/docs/en/settings, Available settings table).
  - Fix: Change apiKeyHelper to Schema.optional(Schema.String). Drop ApiKeyHelperConfig (or keep it only as a deprecated union member for transition). Any real settings file using the documented string form currently makes the library reject all settings in that scope.

- **HookEntry union missing the mcp_tool handler type — valid hooks sections fail decode**  
  `/Users/m/repos/effect-claudecode/src/Settings/HooksSection.ts` · batch verified (high)
  - Library: src/Settings/HooksSection.ts:79-84 defines HookEntry as a union of exactly four types (command, http, prompt, agent); doc comment at :21-22 says 'Claude Code supports four hook types'. Probe confirmed: a settings file containing { "type": "mcp_tool", "server": "s", "tool": "t" } fails decode, aborting the entire settings load.
  - Current: Current Claude Code supports five handler types: command, http, mcp_tool, prompt, agent. mcp_tool fields: server (required), tool (required), input (optional object with ${path} substitution, e.g. "${tool_input.file_path}") (https://code.claude.com/docs/en/hooks).
  - Fix: Add an McpToolHookEntry class ({ type: 'mcp_tool', server: string, tool: string, input?: Record<string, unknown>, timeout?: number }) to the HookEntry union and update the 'four hook types' doc comment to five.
  - Note: This union (src/Settings/HooksSection.ts) is shared by plugin hooks/hooks.json loading and skill/agent frontmatter hooks blocks, so the same fix unblocks all three (also reported on the plugin and skill/subagent surfaces).

- **extraKnownMarketplaces union rejects git/hostPattern/settings sources and drops autoUpdate/path/skipLfs**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:80-110 models Marketplace as a union of only DirectoryMarketplace ({source:{source:'directory',path}}) and GithubMarketplace ({source:{source:'github',repo,ref?}}). Probe confirmed: { source: { source: 'git', url: '...' } } fails decode and aborts the load; github entries with path/skipLfs and top-level autoUpdate decode but those fields are silently dropped.
  - Current: extraKnownMarketplaces values are { source: {...}, autoUpdate?: boolean } with source types github (repo, ref?, path?), git (url, ref, path), directory (path), hostPattern, and settings (inline: name + plugins); skipLfs: true supported inside github/git sources since v2.1.153 (https://code.claude.com/docs/en/settings, Plugin configuration).
  - Fix: Add git, hostPattern, and settings source variants; add path to GithubSourceSpec and skipLfs to github/git; add autoUpdate?: boolean at the marketplace-entry level. Alternatively loosen the record value to a permissive schema so unknown source types never abort the whole settings load.
  - Note: The dropped autoUpdate/path/skipLfs fields are confirmed; the exact set of additional source variants (git/hostPattern/settings) could not be fully evidenced from docs — verify against the live settings JSON schema when fixing. Related: pluginConfigs[<plugin-id>].options is also absent from the settings schema.

- **Library requires `type` on stdio entries, rejecting valid .mcp.json files where it is omitted**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: Every server entry must carry a `type` discriminator: `StdioMcpServer` declares `type: Schema.Literal('stdio')` as a required field (src/Mcp/Schema.ts:96) and `McpServerConfig` is a union discriminated only on that literal with no fallback inference (src/Mcp/Schema.ts:148-152). `Mcp.loadJson` decodes strictly against this (src/Mcp/JsonFile.ts:97-99), so an entry like `{"command": "/path/to/server", "args": [], "env": {}}` fails with McpConfigError.
  - Current: Per https://code.claude.com/docs/en/mcp, `type` is optional for stdio servers when `command` is present — the docs' own verbatim project-scope example is `{"mcpServers": {"shared-server": {"command": "/path/to/server", "args": [], "env": {}}}}` with no `type` field. The library would reject this documented canonical example.
  - Fix: Make `type` optional on `StdioMcpServer` (e.g. `Schema.optional(Schema.Literal('stdio'))` or `optionalWith` + default 'stdio'), and ensure union resolution treats an entry with `command` and no `type` as stdio. Update doc comments at src/Mcp/Schema.ts:141-143 accordingly.

- **WebSocket (`ws`) transport is explicitly rejected by the library but is valid in current .mcp.json**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: `McpServerConfig = Union([StdioMcpServer, HttpMcpServer, SseMcpServer])` (src/Mcp/Schema.ts:148-152) has no ws variant; doc comment asserts 'Claude Code understands three transports' (src/Mcp/Schema.ts:4). Tests assert a websocket-style entry is rejected with a SchemaError (test/Mcp/Schema.test.ts:179-186, 304-325).
  - Current: https://code.claude.com/docs/en/mcp documents `type: "ws"` as a current JSON-config-only transport (not available via `claude mcp add --transport`), e.g. `'{"type":"ws","url":"wss://mcp.example.com/socket","headers":{"Authorization":"Bearer YOUR_TOKEN"}}'`; it 'accepts the same `url`, `headers`, `headersHelper`, `timeout`, and `alwaysLoad` fields as `http`' with header-only auth (no OAuth). A valid current .mcp.json containing a ws server fails the library's loadJson.
  - Fix: Add a `WsMcpServer` class with `type: Schema.Literal('ws')`, required `url`, optional `headers`, `headersHelper`, `timeout`, `alwaysLoad` (no oauth), include it in `McpServerConfig`, and update/remove the test asserting rejection.

- **`streamable-http` alias for `http` is rejected**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: `HttpMcpServer` accepts only the exact literal `type: 'http'` (src/Mcp/Schema.ts:114); no other spelling is in the union, so entries with `type: "streamable-http"` fail decode in `Mcp.loadJson` and in plugin inline mcpServers (src/Plugin/Define.ts:258-265 uses decodeUnknownSync against the same union).
  - Current: https://code.claude.com/docs/en/mcp states verbatim: 'When configuring MCP servers via JSON in `.mcp.json`, `~/.claude.json`, or `claude mcp add-json`, the `type` field accepts `streamable-http` as an alias for `http`.' Files using the alias are valid for current Claude Code but rejected by the library.
  - Fix: Accept the alias, e.g. change to `Schema.Literal('http', 'streamable-http')` (or decode-time normalization of 'streamable-http' to 'http') on `HttpMcpServer`.

- **Fabricated `authorization` block (oauth2/apiKey/bearer) instead of Claude Code's real `oauth` object**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: The library models a first-class `authorization` field on http/sse servers as a discriminated union of `oauth2` (clientId/clientSecret/tokenUrl/scopes array), `apiKey` (key/header), and `bearer` (token) (src/Mcp/Schema.ts:31-79, 119, 134), and its doc comment claims every variant may include an `authorization` block (src/Mcp/Schema.ts:13-15). `Plugin.write` serializes these fields verbatim into emitted .mcp.json files (src/Plugin/Define.ts:613-617, 731-744).
  - Current: No `authorization` field exists in the current contract (https://code.claude.com/docs/en/mcp). The real field is an `oauth` object on http/sse only, with `clientId` (string), `callbackPort` (number), `authServerMetadataUrl` (https:// string, v2.1.64+), and `scopes` (a single space-separated string per RFC 6749 §3.3, not an array). Client secrets are never stored in config ('stored securely in your system keychain (macOS) or a credentials file, not in your config' — supplied via --client-secret or MCP_CLIENT_SECRET). Bearer/API-key auth is expressed via plain `headers`. An emitted `authorization` block is ignored by Claude Code, so auth configured through the library's types silently does not work; modeling `clientSecret` and `tokenUrl` as config fields contradicts the documented security model.
  - Fix: Remove `McpAuthorization`/`OAuth2Authorization`/`ApiKeyAuthorization`/`BearerAuthorization` and the `authorization` field. Add an `oauth` schema `{ clientId?: string; callbackPort?: number; authServerMetadataUrl?: string; scopes?: string }` on `HttpMcpServer` and `SseMcpServer` (not stdio, not ws). Fix the doc comment at src/Mcp/Schema.ts:13-15.

- **Output-style frontmatter requires `name`, but current Claude Code makes all output-style fields optional (name defaults to file name)**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/OutputStyle.ts` · batch verified (high)
  - Library: `OutputStyleFrontmatter` declares `name: Schema.String` as required (src/Frontmatter/OutputStyle.ts:25); decode of `{ description: 'd' }` fails with 'Missing key at [name]' (verified empirically; also test/Frontmatter/Schemas.test.ts:229-234 asserts `{}` is rejected). The loader derives style names from frontmatter `name` (src/Plugin/Load.ts:546) and `Plugin.define` throws if entry name != frontmatter name (src/Plugin/Define.ts:268-299).
  - Current: https://code.claude.com/docs/en/output-styles — frontmatter table lists `name` as optional: 'Name of the output style, if not the file name' with default 'Inherits from file name'; 'The file name becomes the style name unless you set `name` in the frontmatter.' A valid current output-style file may have no frontmatter `name` at all.
  - Fix: Make `name` optional in OutputStyleFrontmatter; in src/Plugin/Load.ts fall back to `path.basename(filePath, '.md')` when frontmatter.name is absent (mirroring how commands already derive names at Load.ts:477); relax the Define.ts entry-name-vs-frontmatter-name coherence check to only fire when frontmatter.name is present.

- **Skill `effort` enum rejects `xhigh`, a valid effort level since v2.1.111**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: src/Frontmatter/Skill.ts:58-60 constrains `effort` to Schema.Literals(['low','medium','high','max']). Runtime-verified: decoding `effort: 'xhigh'` fails with `Expected "low" | "medium" | "high" | "max", got "xhigh"`.
  - Current: Skill frontmatter `effort` options are low, medium, high, xhigh, max (https://code.claude.com/docs/en/skills, frontmatter reference); `xhigh` effort level added in v2.1.111 and skill `effort` field added in v2.1.80 (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Add 'xhigh' to the effort literals: Schema.Literals(['low','medium','high','xhigh','max']). Consider extracting a shared EffortLevel schema used by both Skill and Subagent frontmatter.
  - Note: The same effort enum is shared by command frontmatter; one fix covers commands, skills, and subagents.

- **Subagent `effort` enum rejects `xhigh`**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: src/Frontmatter/Subagent.ts:50-52 constrains `effort` to Schema.Literals(['low','medium','high','max']). Runtime-verified: decoding `effort: 'xhigh'` fails.
  - Current: Subagent `effort` accepts low, medium, high, xhigh, max (https://code.claude.com/docs/en/sub-agents); `xhigh` added v2.1.111, effort extended to plugin agents v2.1.78 (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Add 'xhigh' to the effort literals in SubagentFrontmatter (same fix as Skill.ts; share one EffortLevel schema).

- **Skill `name` and `description` are required by the library but optional in current Claude Code**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: src/Frontmatter/Skill.ts:44-46 declares `name: Schema.String` and `description: Schema.String` as required (doc comment lines 5-7: 'Only name and description are required'). Runtime-verified: decoding `{ description: 'y' }` fails with `Missing key at ["name"]`, and `{ name: 'x' }` fails on description. parseSkillFile (src/Frontmatter/Parser.ts:241-252) therefore rejects SKILL.md files Claude Code loads fine (only fully-frontmatterless files pass, since no delimiters yields frontmatter: undefined).
  - Current: Claude Code skills docs state verbatim: 'All fields are optional. Only description is recommended so Claude knows when to use the skill.' `name` defaults to the directory name; missing `description` falls back to the first paragraph of the markdown body (https://code.claude.com/docs/en/skills, frontmatter reference). Note the Agent Skills open standard does require name/description (https://agentskills.io/specification), but Claude Code itself accepts files without them.
  - Fix: Make `name` and `description` optional in SkillFrontmatter to match Claude Code's load behavior (optionally expose a stricter spec-conformance schema separately). Update the doc comment that claims both are required.
  - Note: Docs list description as "recommended" (not required); the library requires both name and description.

- **Skill `paths` rejects the comma-separated string form**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: src/Frontmatter/Skill.ts:67 types `paths` as Schema.optional(Schema.Array(Schema.String)) only. Runtime-verified: decoding `paths: 'src/**, lib/**'` fails with `Expected array | undefined, got "src/**, lib/**"`.
  - Current: Skill `paths` accepts a comma-separated string or a YAML list (https://code.claude.com/docs/en/skills, frontmatter reference); the YAML-list form was the v2.1.84 addition — the string form is the original shape (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Change `paths` to the existing StringOrStringArray union (Skill.ts:26-29), matching how `allowed-tools` is already modeled.


## P1 — Missing: current capabilities the library cannot express or access

### Hook events

- **PermissionRequest deny decision lacks the interrupt field**  
  `src/Hook/Events/PermissionRequest.ts` · dual-lens verified (docs + code)
  - Library: PermissionDecision has only behavior, updatedInput, updatedPermissions, message (src/Hook/Events/PermissionRequest.ts:91-100); deny(message) (lines 145-154) cannot set interrupt, and the closed class constructor prevents users from adding it.
  - Current: The hooks reference (https://code.claude.com/docs/en/hooks) documents decision.interrupt for "deny" only: "if true, stops Claude".
  - Fix: Add interrupt: Schema.optional(Schema.Boolean) to PermissionDecision and an options parameter on deny() (e.g. deny(message, { interrupt: true })).

- **PostToolUse output lacks updatedToolOutput (universal tool-output replacement since v2.1.121)**  
  `src/Hook/Events/PostToolUse.ts` · dual-lens verified (docs + code)
  - Library: PostToolUse HookSpecificOutput has only hookEventName, additionalContext, updatedMCPToolOutput (src/Hook/Events/PostToolUse.ts:41-47). The closed Schema.Class means users cannot emit updatedToolOutput at all, so replacing a built-in tool's output (e.g. redacting Bash stdout) is impossible through this library.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks): hookSpecificOutput.updatedToolOutput "Replaces the tool's output with the provided value before it is sent to Claude" and works for all tools since v2.1.121 (CHANGELOG: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md). Docs verbatim example replaces Bash output {stdout, stderr, interrupted, isImage}.
  - Fix: Add updatedToolOutput: Schema.optional(Schema.Unknown) to PostToolUse.HookSpecificOutput and a replaceOutput(updatedToolOutput, additionalContext?) helper.

- **duration_ms input field (v2.1.119) not modeled on PostToolUse or PostToolUseFailure**  
  `src/Hook/Events/PostToolUse.ts` · dual-lens verified (docs + code)
  - Library: PostToolUse.Input (src/Hook/Events/PostToolUse.ts:25-35) and PostToolUseFailure.Input (src/Hook/Events/PostToolUseFailure.ts:19-30) have no duration_ms field. Schemas are open (excess properties ignored — verified empirically), so payloads still decode, but the field is invisible to typed handlers.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks) shows duration_ms in both events' input examples ("Tool execution time in milliseconds. Excludes time spent in permission prompts and PreToolUse hooks"); added in v2.1.119 per CHANGELOG (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Add duration_ms: Schema.optional(Schema.Number) to both PostToolUse.Input and PostToolUseFailure.Input.

- **Universal output field terminalSequence (v2.1.141) absent from all five Output classes**  
  `src/Hook/Events/PreToolUse.ts` · dual-lens verified (docs + code)
  - Library: Every event Output models only continue, stopReason, suppressOutput, systemMessage, hookSpecificOutput (src/Hook/Events/PreToolUse.ts:83-89, PostToolUse.ts:49-57, PostToolUseFailure.ts:39-45, PermissionRequest.ts:109-115, PermissionDenied.ts equivalent). The closed Schema.Class constructors make terminalSequence unrepresentable.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks): universal JSON output field terminalSequence (added v2.1.141 per CHANGELOG) — escape sequence emitted on the hook's behalf, allowlisted to OSC 0/1/2/9/99/777 + BEL. Notably relevant since v2.1.139 hooks run without a controlling terminal and docs steer hooks toward systemMessage/terminalSequence.
  - Fix: Add terminalSequence: Schema.optional(Schema.String) to the shared universal-output fields in all five event Output classes (ideally factor the universal fields into one shared record like envelopeFields).

- **PostToolUseFailure output omits top-level decision/reason that current docs list in the decision-pattern summary**  
  `src/Hook/Events/PostToolUseFailure.ts` · dual-lens verified (docs + code)
  - Library: PostToolUseFailure.Output has only the universal fields plus hookSpecificOutput.additionalContext — no decision or reason (src/Hook/Events/PostToolUseFailure.ts:32-45), unlike PostToolUse.Output which models decision: 'block' and reason.
  - Current: The hooks reference decision-pattern summary (https://code.claude.com/docs/en/hooks) lists PostToolUseFailure alongside PostToolUse under the top-level decision: "block" + reason pattern (the event still cannot block execution — the tool already failed — but the reason/feedback channel is documented). Docs are partly ambiguous: the event-specific section shows only additionalContext.
  - Fix: Add optional decision: Schema.Literal('block') and reason: Schema.optional(Schema.String) to PostToolUseFailure.Output (matching PostToolUse), with JSDoc noting it feeds feedback to Claude rather than blocking.

### Hook runner & tooling

- **Common input fields effort, agent_id, agent_type not modeled in the envelope**  
  `src/Hook/Envelope.ts` · dual-lens verified (docs + code)
  - Library: envelopeFields contains only session_id, transcript_path, cwd, hook_event_name, permission_mode (src/Hook/Envelope.ts:39-45), and HookContext maps only those (src/Hook/Context.ts:56-60). Open schemas tolerate the extra fields, but typed handlers cannot access them.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks): effort ({ level: "low"|"medium"|"high"|"xhigh"|"max" }) is present for tool-use-context events (PreToolUse, PostToolUse, ...) when the model supports effort; agent_id and agent_type are added in subagent/--agent context.
  - Fix: Add optional effort ({ level: Literals }), agent_id, and agent_type to envelopeFields (all optionalKey) and surface them on HookContext.

### Plugin system

- **PluginManifest lacks current fields: displayName, defaultEnabled, $schema, dependencies, experimental.themes/monitors — all silently deleted on load→write round-trips**  
  `src/Plugin/Manifest.ts` · batch verified (high)
  - Library: src/Plugin/Manifest.ts:150-179 models name, version, description, author, homepage, repository, license, keywords, commands, agents, skills, outputStyles, hooks, mcpServers, lspServers, userConfig, channels — nothing else. Empirically, decoding `{name, displayName, defaultEnabled, $schema, dependencies, experimental}` succeeds but strips all unknown fields to `{"name":"x"}`, so Plugin.load → Plugin.write rewrites the manifest without them.
  - Current: Current plugin.json additionally supports `displayName` (v2.1.143+), `defaultEnabled` (boolean, default true, v2.1.154+), `$schema` (accepted by claude plugin validate since v2.1.120), `dependencies` (array of plugin names or {name, version} objects), and `experimental.themes` / `experimental.monitors` path overrides (top-level themes/monitors deprecated since v2.1.129) (https://code.claude.com/docs/en/plugins-reference; https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Add optional `displayName`, `defaultEnabled`, `$schema`, `dependencies` (string | {name, version?} array), and an `experimental` struct with optional `themes`/`monitors` ComponentPathSpec fields; thread them through inferredManifest (src/Plugin/Load.ts:395-440) and syncManifest (src/Plugin/Layout.ts:94-136) so round-trips preserve them.

- **marketplace.json schema lacks current top-level and entry fields ($schema, version, metadata.pluginRoot, allowCrossMarketplaceDependenciesOn; entry displayName/category/tags/defaultEnabled and component overrides)**  
  `src/Plugin/Marketplace.ts` · batch verified (high)
  - Library: MarketplaceFile (src/Plugin/Marketplace.ts:109-116) has only name, description?, owner?, plugins. MarketplacePluginEntry (lines 83-96) has only name, source, description, version, author, homepage, repository, license, keywords, strict. Empirically, `metadata: {pluginRoot}` and entry `category`/`tags`/`defaultEnabled`/`displayName` decode but are silently stripped.
  - Current: Current marketplace.json supports top-level `$schema`, `version`, `metadata.pluginRoot` (base dir prepended to relative plugin sources), and `allowCrossMarketplaceDependenciesOn`; plugin entries may include any plugin-manifest field plus `displayName` (v2.1.143+), `category`, `tags`, `defaultEnabled` (v2.1.154+, takes precedence over plugin.json's), and component config fields skills/commands/agents/hooks/mcpServers/lspServers (https://code.claude.com/docs/en/plugin-marketplaces).
  - Fix: Add the missing optional top-level fields ($schema, version, metadata with pluginRoot, allowCrossMarketplaceDependenciesOn) and entry fields (displayName, category, tags, defaultEnabled, plus the component path-override fields shared with PluginManifest).

- **Root-level single-SKILL.md plugins (v2.1.142+) not discovered by Plugin.scan**  
  `src/Plugin/Load.ts` · batch verified (high)
  - Library: Plugin.scan only discovers skills under the `skills/` fallback dir or manifest-declared skills paths (src/Plugin/Load.ts:606-610, 269-329); a SKILL.md sitting directly at the plugin root with no skills/ dir and no manifest `skills` field yields zero skills.
  - Current: Since v2.1.142, a root-level SKILL.md with no skills/ directory and no skills manifest field auto-loads as a single-skill plugin (https://code.claude.com/docs/en/plugins-reference; https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: In scan's skill discovery, when no manifest skills spec exists and skills/ is absent, check for `<root>/SKILL.md` and load it as a single skill.

- **Plugin layout components not modeled: themes/, monitors, bin/, plugin-root settings.json**  
  `src/Plugin/Load.ts` · batch verified (high)
  - Library: The library's layout covers only .claude-plugin/plugin.json, commands/, agents/, skills/, output-styles/, hooks/hooks.json, and .mcp.json (src/Plugin/Define.ts:12-22; src/Plugin/Layout.ts:14-19; src/Plugin/Load.ts:596-649). No code references themes, monitors, bin/, or a plugin-root settings.json.
  - Current: Current plugin layout also includes themes/ (experimental color themes), monitors/monitors.json (background monitors, v2.1.105+; required fields name/command/description, optional when), bin/ (executables added to Bash tool PATH while the plugin is enabled), and a plugin-root settings.json (default settings; only `agent` and `subagentStatusLine` keys supported) (https://code.claude.com/docs/en/plugins-reference; https://code.claude.com/docs/en/plugins).
  - Fix: Model these as additional optional plugin components in scan/load/write (at minimum, pass them through without destroying them), matching the current default-locations table.

### Other

- **PreCompact input does not model `custom_instructions`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/PreCompact.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/PreCompact.ts:24-31 models only envelope + `trigger`. No `custom_instructions` field exists on PreCompact (the field was instead placed on Stop — see separate finding).
  - Current: PreCompact input includes `custom_instructions` (string): for `manual` it carries what the user passed to /compact, empty string for `auto` — per https://code.claude.com/docs/en/hooks#precompact (example shows "custom_instructions": "").
  - Fix: Add `custom_instructions: Schema.optional(Schema.String)` (or required, since the docs example always includes it) to PreCompact Input. Decode succeeds today because the schema is open (verified: extra keys are ignored), but handlers cannot access the user's /compact instructions in a typed way.

- **PreCompact output cannot block compaction (decision: "block" added in v2.1.105)**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/PreCompact.ts` · batch verified (high)
  - Library: src/Hook/Events/PreCompact.ts:37-42 models only the four common output fields; the only helper is `passthrough()` (PreCompact.ts:48-49). The library offers no way to emit a blocking decision for PreCompact.
  - Current: Since v2.1.105, PreCompact hooks can block compaction via exit code 2 or JSON {"decision": "block", "reason": ...}. The docs decision table lists PreCompact among events supporting top-level decision/reason. https://code.claude.com/docs/en/hooks#precompact and CHANGELOG.md v2.1.105.
  - Fix: Add `decision: Schema.optional(Schema.Literal('block'))` and `reason: Schema.optional(Schema.String)` to PreCompact Output, plus a `block(reason)` helper mirroring Stop's, and update the module doc comment which implies observability-only.

- **Stop input missing `last_assistant_message`, `background_tasks`, `session_crons`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/Stop.ts` · batch verified (high)
  - Library: src/Hook/Events/Stop.ts:22-30 models only envelope + `stop_hook_active` + a (bogus) optional `custom_instructions`.
  - Current: Current Stop input includes `last_assistant_message` (string, Claude's final response text, since v2.1.47) and `background_tasks` / `session_crons` arrays (since v2.1.145, present when the task registry is reachable; entries carry id/type/status/description/command/agent_type/server/tool/name and id/schedule/recurring/prompt respectively). https://code.claude.com/docs/en/hooks#stop
  - Fix: Add optional `last_assistant_message: Schema.String`, and optional `background_tasks` / `session_crons` array schemas to Stop Input. Decode succeeds today (open schema), but handlers cannot read these fields in a typed way.

- **SubagentStop input missing `background_tasks` and `session_crons`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/SubagentStop.ts` · batch verified (high)
  - Library: src/Hook/Events/SubagentStop.ts:23-34 models envelope + stop_hook_active, agent_id, agent_type, agent_transcript_path, last_assistant_message — but not the task-registry arrays.
  - Current: SubagentStop input also carries `background_tasks` and `session_crons` since v2.1.145 ('scoped to the parent session, not the subagent') — https://code.claude.com/docs/en/hooks#subagentstop and CHANGELOG.md v2.1.145.
  - Fix: Add optional `background_tasks` / `session_crons` array fields (shared schema with Stop). Open schema means no decode failure today, just untyped/inaccessible data.

- **Stop and SubagentStop outputs missing `hookSpecificOutput.additionalContext` non-error feedback (v2.1.163)**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/Stop.ts` · batch verified (high)
  - Library: src/Hook/Events/Stop.ts:36-43 and src/Hook/Events/SubagentStop.ts:40-47 model outputs with only decision/reason + common fields; there is no hookSpecificOutput on either, so this capability cannot be expressed through the closed output schema.
  - Current: Since v2.1.163, Stop and SubagentStop accept {"hookSpecificOutput": {"hookEventName": "Stop"|"SubagentStop", "additionalContext": ...}} — 'Non-error feedback for Claude. The conversation continues so Claude can act on it, but unlike decision: "block" it is shown in the transcript as hook feedback rather than a hook error.' https://code.claude.com/docs/en/hooks#stop and CHANGELOG.md v2.1.163.
  - Fix: Add a HookSpecificOutput class (hookEventName literal + optional additionalContext) to both Stop and SubagentStop Output schemas, plus an `addContext()`-style helper on each.

- **SessionStart output missing `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/SessionStart.ts` · batch verified (high)
  - Library: src/Hook/Events/SessionStart.ts:45-58 models hookSpecificOutput with only `hookEventName` + optional `additionalContext`; the only helpers are passthrough() and addContext().
  - Current: Current SessionStart hookSpecificOutput supports: `additionalContext`, `initialUserMessage` (creates the first user turn, -p mode only), `sessionTitle` (same effect as /rename; startup/resume only; v2.1.152), `watchPaths` (array of absolute paths watched for FileChanged), and `reloadSkills` (boolean, re-scan skill/command dirs; v2.1.152). https://code.claude.com/docs/en/hooks#sessionstart
  - Fix: Extend SessionStart's HookSpecificOutput with optional `initialUserMessage: Schema.String`, `sessionTitle: Schema.String`, `watchPaths: Schema.Array(Schema.String)`, `reloadSkills: Schema.Boolean`, and add corresponding helpers (e.g. renameSession, watchPaths). The closed output schema currently makes these capabilities impossible to emit.

- **SessionStart input missing optional `session_title`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/SessionStart.ts` · batch verified (high)
  - Library: src/Hook/Events/SessionStart.ts:30-39 models envelope + source + optional model + optional agent_type; no `session_title`.
  - Current: SessionStart input includes optional `session_title` (string) — the current title if already set via --name or /rename. https://code.claude.com/docs/en/hooks#sessionstart
  - Fix: Add `session_title: Schema.optional(Schema.String)` to SessionStart Input. Open schema means no decode failure today; the field is just inaccessible.

- **UserPromptSubmit output missing `suppressOriginalPrompt`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/UserPromptSubmit.ts` · batch verified, conflict re-resolved by direct doc fetch 2026-06-12
  - Library: src/Hook/Events/UserPromptSubmit.ts:43-51 models Output with decision/reason/common fields and hookSpecificOutput (additionalContext, sessionTitle) — no `suppressOriginalPrompt`.
  - Current: UserPromptSubmit supports `suppressOriginalPrompt` (boolean): "If `true` when `decision` is `"block"`, omits the original prompt text from the block message shown to the user." (verbatim from https://code.claude.com/docs/en/hooks.md, UserPromptSubmit decision-control table). The table groups it with the hookSpecificOutput fields (additionalContext, sessionTitle); the example JSON omits it, so confirm top-level vs hookSpecificOutput placement empirically when implementing.
  - Fix: Add `suppressOriginalPrompt: Schema.optional(Schema.Boolean)` to the Output (or HookSpecificOutput) class and optionally a `block(reason, {suppressOriginalPrompt})` variant. The closed output schema currently prevents emitting it.
  - Note: One batch verifier refuted this finding after its doc fetch was truncated before the relevant table; a direct fetch of the raw page confirmed the field exists. The refutation was discarded.

- **PostCompact input missing `compact_summary`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/PostCompact.ts` · batch verified (high)
  - Library: src/Hook/Events/PostCompact.ts:21-28 models only envelope + `trigger`.
  - Current: PostCompact input includes `compact_summary` (string): 'the conversation summary generated by the compact operation' — the docs example shows it alongside trigger. https://code.claude.com/docs/en/hooks#postcompact
  - Fix: Add `compact_summary: Schema.optional(Schema.String)` (or required, matching the docs example) to PostCompact Input. Open schema, so no decode failure today.

- **Four current hook events are not modeled at all: Setup, UserPromptExpansion, PostToolBatch, MessageDisplay**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/index.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/index.ts builds the exhaustive HookInput union from exactly 26 events (comment 'all 26 events' at index.ts:79; union at index.ts:89-123; HookEventName type at index.ts:133). Runner.dispatch exits 0 silently for unregistered events (Runner.ts:255-261), so no runtime breakage — the events simply cannot be handled or typed.
  - Current: Current docs (https://code.claude.com/docs/en/hooks, fetched 2026-06-12) list 30 events. Missing from the library: Setup (added 2.1.10, fires on --init/--init-only/--maintenance, input `trigger`: init|maintenance, output hookSpecificOutput.additionalContext), UserPromptExpansion (fires on slash-command expansion; input expansion_type/command_name/command_args/command_source/prompt; decision:block supported), PostToolBatch (fires after a parallel tool batch; input `tool_calls` array; block/continue:false stops the loop), MessageDisplay (added 2.1.152; input turn_id/message_id/index/final/delta; output hookSpecificOutput.displayContent). All 26 names the library encodes still exist unrenamed; per changelog (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md, latest 2.1.175) none were removed.
  - Fix: Add Setup.ts, UserPromptExpansion.ts, PostToolBatch.ts, and MessageDisplay.ts event modules with the documented input/output schemas, include them in the HookInput union, and update the 'all 26 events' comment to 30.

- **Elicitation input misses the real payload fields (message, mode, url, elicitation_id, requested_schema) and instead models nonexistent tool_name/tool_input**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/Elicitation.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/Elicitation.ts:22-31 models Input as envelope + mcp_server_name (required, correct) + optional `tool_name` and `tool_input` — two fields current docs do not list, which will always decode as undefined. The schema is open (excess properties ignored), so real payloads still decode, but handlers cannot read what the server is asking.
  - Current: Current docs (https://code.claude.com/docs/en/hooks#elicitation, fetched 2026-06-12; event added 2.1.76 per changelog): input is mcp_server_name, `message`, optional `mode` ("form"|"url"), optional `url` (url-mode), optional `elicitation_id`, optional `requested_schema` (JSON schema object, form-mode). Output hookSpecificOutput.action accept|decline|cancel + content (library output matches; exit 2 denies).
  - Fix: Add `message: Schema.String`, `mode: Schema.optional(Schema.Literals(['form','url']))`, `url: Schema.optional(Schema.String)`, `elicitation_id: Schema.optional(Schema.String)`, `requested_schema: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))` to Input, and drop the phantom tool_name/tool_input fields. Output and the mcp_server_name matcher are already correct.

- **CwdChanged misses input fields old_cwd/new_cwd and the watchPaths output**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/CwdChanged.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/CwdChanged.ts:19-25 models Input as the bare envelope with no event-specific fields ('no decision control', header lines 4-7); Output (lines 27-32) has only the four common fields. Payloads decode fine (open schema) but handlers cannot see where the cwd moved from/to, and cannot update the FileChanged watch list.
  - Current: Current docs (https://code.claude.com/docs/en/hooks#cwdchanged, fetched 2026-06-12; added 2.1.83 per changelog): input includes `old_cwd` and `new_cwd` (the common `cwd` shows the new directory); output supports `watchPaths` (array of absolute paths replacing the dynamic FileChanged watch list; empty array clears it). CLAUDE_ENV_FILE availability (library header line 6) is confirmed correct.
  - Fix: Add `old_cwd: Schema.String` and `new_cwd: Schema.String` to Input, and `watchPaths: Schema.optional(Schema.Array(Schema.String))` to Output.

- **Tool adapters cover only Bash(command) and Read(file_path); current documented tool set is far larger and Task is now Agent**  
  `/Users/m/repos/effect-claudecode/src/Hook/Tool.ts` · batch verified (medium)
  - Library: src/Hook/Tool.ts:150-152 SupportedToolName = 'Bash' | 'Read'; BashToolInput (Tool.ts:81-83) lacks description/timeout/run_in_background; ReadToolInput (Tool.ts:104-106) lacks offset/limit; no adapters for Edit, Write, Glob, Grep, Agent, WebFetch, WebSearch, AskUserQuestion, ExitPlanMode, NotebookEdit
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks) documents tool_input shapes for Bash (command, description, timeout ms, run_in_background), Read (file_path, offset, limit), Edit (file_path, old_string, new_string, replace_all), Write (file_path, content), Glob (pattern, path), Grep (pattern, path, glob, output_mode, -i, multiline), WebFetch (url, prompt), WebSearch (query, allowed_domains, blocked_domains), Agent (prompt, description, subagent_type, model — the Task tool has been renamed Agent), AskUserQuestion, and ExitPlanMode; NotebookEdit is no longer in the documented tool set.
  - Fix: Extend BashToolInput/ReadToolInput with the documented optional fields and add typed adapters for Edit, Write, Glob, Grep, Agent, WebFetch, WebSearch (plus AskUserQuestion/ExitPlanMode if desired), using 'Agent' (not 'Task') as the tool name.

- **Managed/enterprise settings scope and --settings CLI tier absent from loader precedence**  
  `/Users/m/repos/effect-claudecode/src/Settings/Loader.ts` · batch verified (high)
  - Library: src/Settings/Loader.ts:181-216 loads exactly three files — ~/.claude/settings.json, <cwd>/.claude/settings.json, <cwd>/.claude/settings.local.json — merged user -> project -> local. No managed-settings path exists anywhere in src/Settings/ (the only 'managed' acknowledgment in the repo is the InstructionsLoaded MemoryType literal in src/Hook/Events/InstructionsLoaded.ts:19-25).
  - Current: Current precedence is Managed > --settings command-line > Local > Project > User. Managed sources: server-managed, macOS plist com.anthropic.claudecode / Windows HKLM registry, then file-based managed-settings.d/*.json + managed-settings.json at /Library/Application Support/ClaudeCode/ (macOS), /etc/claude-code/ (Linux/WSL), C:\Program Files\ClaudeCode\ (Windows); legacy C:\ProgramData path removed in v2.1.75 (https://code.claude.com/docs/en/settings, Settings precedence).
  - Fix: Add a managed scope: read the platform file-based managed-settings.json (plus managed-settings.d drop-ins, alphabetical, deep-merged) and apply it at highest precedence; optionally accept an injected --settings overlay between local and managed. Document that plist/registry/server-managed tiers are out of scope if not implemented.

- **Vast majority of current top-level settings keys unmodeled and silently dropped (sandbox, alwaysThinkingEnabled, language, etc.)**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:136-173 models 19 top-level keys. Probe confirmed the schema is open: unknown keys decode successfully but are stripped from the result (e.g. { sandbox: {...}, model: 'opus' } -> { model: 'opus' }), so consumers of Settings.load lose all unmodeled configuration.
  - Current: Current docs define ~90 top-level keys (https://code.claude.com/docs/en/settings, Available settings). Notable in-scope absences: sandbox (full object: enabled, filesystem.allowWrite/denyWrite/denyRead/allowRead, network.allowedDomains/deniedDomains/proxy ports, excludedCommands, etc.), alwaysThinkingEnabled, language, attribution, availableModels, fallbackModel (string[], max 3), forceLoginMethod, otelHeadersHelper, awsAuthRefresh/awsCredentialExport, allowedHttpHookUrls, httpHookAllowedEnvVars, defaultShell, editorMode, spinnerTipsEnabled/spinnerTipsOverride/spinnerVerbs, voice, worktree, skillOverrides, plansDirectory, autoMemoryEnabled/autoMemoryDirectory, advisorModel, plus recent additions enforceAvailableModels (v2.1.175) and wheelScrollAccelerationEnabled (v2.1.174) per https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md.
  - Fix: Prioritize adding sandbox (its own Schema.Class mirroring the documented sub-keys), attribution, alwaysThinkingEnabled, language, availableModels, fallbackModel, allowedHttpHookUrls, and httpHookAllowedEnvVars; additionally expose the raw decoded JSON (or an index-signature passthrough) so unmodeled keys survive Settings.load instead of being dropped.

- **Command hook entry drops args and asyncRewake fields**  
  `/Users/m/repos/effect-claudecode/src/Settings/HooksSection.ts` · batch verified (high)
  - Library: src/Settings/HooksSection.ts:32-42 models CommandHookEntry with type, command, timeout, async, shell, statusMessage, once only. Probe confirmed args and asyncRewake decode but are stripped from the result.
  - Current: Command hooks also support args (string[]; presence switches to exec form — direct spawn, no shell; shell field ignored when set) and asyncRewake (boolean; background + wakes Claude on exit code 2; implies async) (https://code.claude.com/docs/en/hooks).
  - Fix: Add args: Schema.optional(Schema.Array(Schema.String)) and asyncRewake: Schema.optional(Schema.Boolean) to CommandHookEntry, with doc comments noting the exec-form semantics of args.

- **Hook 'if' filter modeled at the wrong level; common handler fields (if/statusMessage/once) absent from non-command types**  
  `/Users/m/repos/effect-claudecode/src/Settings/HooksSection.ts` · batch verified (high)
  - Library: src/Settings/HooksSection.ts:99-105 puts if?: string on HookMatcherGroup; no hook entry type has an if field (probe confirmed per-entry if is silently dropped). statusMessage and once exist only on CommandHookEntry (:40-41), not on http/prompt/agent entries (:44-70).
  - Current: if is a per-handler field common to all five handler types (one permission rule, e.g. "Bash(git *)"; only evaluated on PreToolUse/PostToolUse/PostToolUseFailure/PermissionRequest/PermissionDenied; fails open). statusMessage and once are likewise common fields for all types; once is honored only in skill frontmatter and ignored in settings files. Current docs define no group-level if on matcher objects ({matcher?, hooks} only) (https://code.claude.com/docs/en/hooks).
  - Fix: Move if onto each hook entry variant (remove or deprecate the group-level field), and add statusMessage/once (with a doc note that once is ignored in settings files) plus if to http, prompt, agent, and the new mcp_tool entries.

- **statusLine missing refreshInterval; permits undocumented type 'disabled'**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:48-54 models StatusLineConfig as { type: 'command' | 'disabled' (required), command?, padding? }. Probe confirmed refreshInterval decodes but is silently dropped.
  - Current: statusLine is { type: "command", command: string, padding?: number (default 0), refreshInterval?: number (seconds, min 1) }; no 'disabled' type is documented (https://code.claude.com/docs/en/statusline and https://code.claude.com/docs/en/settings).
  - Fix: Add refreshInterval: Schema.optional(Schema.Number); drop or deprecate the 'disabled' literal (disabling is done by removing the key or via disableAllHooks for the custom status line).

- **`alwaysLoad` (all transports, v2.1.121+) not modeled and silently stripped on round-trip**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: No transport variant declares `alwaysLoad` (src/Mcp/Schema.ts:93-135; grep over src finds no occurrence). effect Schema.Class decode tolerates the unknown key, but class instances carry only declared fields, so a loaded config re-serialized via `Plugin.write` (src/Plugin/Define.ts:613-617) drops `alwaysLoad`.
  - Current: https://code.claude.com/docs/en/mcp: `alwaysLoad` (boolean) is 'available on all server types' (requires v2.1.121+); it exempts the server from tool-search deferral and blocks startup until connect (capped at the 5-second connect timeout). Documented example: `{"type": "http", "url": "https://mcp.example.com/mcp", "alwaysLoad": true}`.
  - Fix: Add `alwaysLoad: Schema.optional(Schema.Boolean)` to all server variants (stdio, http, sse, and the new ws).

- **`headersHelper` on remote transports not modeled and stripped on round-trip**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: `HttpMcpServer` and `SseMcpServer` declare only `headers` for header configuration (src/Mcp/Schema.ts:116, 132); no `headersHelper` exists anywhere in src, so the field is untyped and dropped when configs are normalized/re-emitted through the schema classes.
  - Current: https://code.claude.com/docs/en/mcp documents `headersHelper` (string shell command) on http/sse/ws: prints a JSON object of string headers to stdout, 10-second timeout, dynamic headers override static `headers`, runs fresh per connection, gated on workspace trust at project/local scope, with `CLAUDE_CODE_MCP_SERVER_NAME`/`CLAUDE_CODE_MCP_SERVER_URL` in its environment.
  - Fix: Add `headersHelper: Schema.optional(Schema.String)` to `HttpMcpServer`, `SseMcpServer`, and the new `WsMcpServer`.

- **Env var expansion syntax (${VAR}, ${VAR:-default}) is not modeled or documented**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: No expansion syntax, validation, or documentation exists anywhere in src (grep finds only TS template literals); `headers`/`url`/`env`/`command`/`args` values are treated as opaque strings. The library's only reference to env substitution is the unsupported `allowedEnvVars` field (src/Mcp/Schema.ts:8-9, 117).
  - Current: https://code.claude.com/docs/en/mcp documents `${VAR}` and `${VAR:-default}` expansion in `command`, `args`, `env`, `url`, and `headers`, with the failure mode 'If a required environment variable is not set and has no default value, Claude Code will fail to parse the config.' Plugin configs additionally substitute `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_PROJECT_DIR}`. Opaque pass-through is functionally safe for load/emit, but the library offers no typing, docs, or validation for a core feature of the format.
  - Fix: At minimum, document the expansion syntax in the module JSDoc (especially for plugin authors using `${CLAUDE_PLUGIN_ROOT}` in emitted .mcp.json). Optionally add a lint/validate helper that flags `${VAR}` references without defaults.

- **User and local MCP scopes (~/.claude.json) are not modeled; only project .mcp.json exists**  
  `/Users/m/repos/effect-claudecode/src/ClaudeProject.ts` · dual-lens verified (docs + code)
  - Library: The only MCP config location modeled is project-scope `<cwd>/.mcp.json` (src/ClaudeProject.ts:142-143, 160-184). The user/project/local three-tier merge exists only for settings.json (src/Settings/Loader.ts:106-156); there is no model of `~/.claude.json` or scope precedence for MCP servers.
  - Current: https://code.claude.com/docs/en/mcp#mcp-installation-scopes defines three scopes: `local` (default; stored in `~/.claude.json` under `projects.<project-path>.mcpServers`; 'was called project in older versions'), `project` (`.mcp.json` in project root), and `user` (`~/.claude.json` top level; 'was called global'). Precedence local > project > user > plugins > claude.ai connectors, with whole-entry override ('fields are not merged across scopes') and name-based duplicate matching.
  - Fix: Add a `~/.claude.json` schema (top-level `mcpServers` record plus `projects.<path>.mcpServers`) and a scope-aware loader that resolves effective servers using documented precedence, or explicitly document that only project scope is supported.

- **Enterprise managed MCP (managed-mcp.json and policy keys) not modeled**  
  `/Users/m/repos/effect-claudecode/src/Mcp/JsonFile.ts` · dual-lens verified (docs + code)
  - Library: No reference to `managed-mcp.json`, `allowedMcpServers`, `deniedMcpServers`, `allowManagedMcpServersOnly`, or `allowAllClaudeAiMcps` anywhere in src (grep confirms absence).
  - Current: https://code.claude.com/docs/en/managed-mcp defines `managed-mcp.json` (same `{"mcpServers": {...}}` format, exclusive control over which servers load) at fixed OS paths (macOS `/Library/Application Support/ClaudeCode/managed-mcp.json`, Linux `/etc/claude-code/managed-mcp.json`, Windows `C:\Program Files\ClaudeCode\managed-mcp.json`), plus settings policy keys `allowedMcpServers`/`deniedMcpServers` (arrays of `{serverUrl}`/`{serverCommand}`/`{serverName}` matchers), `allowManagedMcpServersOnly`, and `allowAllClaudeAiMcps` (v2.1.149+).
  - Fix: Reuse `McpJsonFile` for a `managed-mcp.json` loader with the documented per-OS default paths, and add the allow/deny matcher schemas to the settings schema if enterprise support is in scope; otherwise document the gap.

- **Reserved server name `workspace` not validated; library can emit a server Claude Code skips**  
  `/Users/m/repos/effect-claudecode/src/Mcp/JsonFile.ts` · dual-lens verified (docs + code)
  - Library: `McpJsonFile.mcpServers` is `Schema.Record(Schema.String, McpServerConfig)` with no key constraints (src/Mcp/JsonFile.ts:45-47), and plugin validation checks only that channel `server` keys exist in mcpConfig (src/Plugin/Validate.ts:403) — so a server named `workspace` passes validation and is written by `Plugin.write`.
  - Current: https://code.claude.com/docs/en/mcp: a server named `workspace` is reserved for internal use and is skipped at load time with a warning ('The server name `workspace` is reserved for internal use'). A library-emitted `workspace` server would be silently non-functional.
  - Fix: Add a schema filter or plugin-validation rule rejecting (or warning on) the server name `workspace` in `mcpServers` records.

- **Command frontmatter schema omits 11 fields valid in command files today; open decode silently strips them, so parse-edit-render round-trips delete user config**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Command.ts` · batch verified (high)
  - Library: CommandFrontmatter encodes exactly 5 keys (src/Frontmatter/Command.ts:35-39). Verified: decoding `{ description, 'disallowed-tools': 'WebFetch', context: 'fork' }` succeeds but yields `{ description }` only — unknown keys are accepted and dropped. renderCommand passes the class instance to YAML stringify (src/Frontmatter/Render.ts:90-100), so the dropped keys never reappear.
  - Current: https://code.claude.com/docs/en/skills (#frontmatter-reference) — commands support the same frontmatter as skills, which additionally includes: `name`, `when_to_use`, `arguments` (named positional args), `user-invocable` (v2.1.0), `disallowed-tools` (v2.1.152), `effort` (v2.1.80), `context: fork` + `agent` + `hooks` (v2.1.0), `paths`, and `shell` (bash|powershell). Versions per CHANGELOG: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
  - Fix: Add the missing optional fields to CommandFrontmatter (or alias it to the unified skill schema). At minimum add `disallowed-tools`, `context`, `agent`, `hooks`, `effort`, `user-invocable`, `arguments`, `when_to_use`, `paths`, `shell`, `name` so round-tripping a current command file is lossless.

- **Output-style schema omits `keep-coding-instructions` and `force-for-plugin`**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/OutputStyle.ts` · batch verified (high)
  - Library: OutputStyleFrontmatter encodes only `name` + `description` (src/Frontmatter/OutputStyle.ts:24-27); grep confirms zero occurrences of keep-coding anywhere in the repo. Verified: decoding `{ name: 'n', 'keep-coding-instructions': true }` succeeds but strips the key, so renderOutputStyle (src/Frontmatter/Render.ts:144-154) and the Plugin.outputStyle builder (src/Plugin/Define.ts:238-248) cannot express or preserve it.
  - Current: https://code.claude.com/docs/en/output-styles — frontmatter fields: `keep-coding-instructions` ('Keep Claude Code's built-in software engineering instructions', default `false`; added v2.0.37, honored for plugin output styles since v2.1.94 per CHANGELOG) and `force-for-plugin` ('Plugin output styles only: apply this style automatically whenever the plugin is enabled... Overrides the user's `outputStyle` setting', default `false`). Since the default is false, silently stripping `keep-coding-instructions: true` on a round-trip changes runtime behavior (style loses coding instructions).
  - Fix: Add `'keep-coding-instructions': Schema.optional(Schema.Boolean)` and `'force-for-plugin': Schema.optional(Schema.Boolean)` to OutputStyleFrontmatter and surface them through Plugin.outputStyle.

- **Body substitution grammar ($ARGUMENTS, $ARGUMENTS[N], 0-based $N, $name, ${CLAUDE_*} vars, \$ escape, !`cmd` / ```! blocks, @file) is not modeled anywhere**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Parser.ts` · batch verified (high)
  - Library: The library treats the markdown body as fully opaque: parse returns everything after the closing `---` verbatim (src/Frontmatter/Parser.ts:84-103) and render appends the body verbatim (src/Frontmatter/Render.ts:55-68). Grep of src/, test/, examples/, README.md finds zero references to $ARGUMENTS, positional args, @file, or !`command`. (Upside: because nothing is encoded, the v2.1.19 breaking renumbering to 0-based positionals — $0 = first arg, $1 = second — does not break the library itself.)
  - Current: https://code.claude.com/docs/en/skills (#available-string-substitutions, #inject-dynamic-context) — current grammar: `$ARGUMENTS` (auto-appended as 'ARGUMENTS: <value>' if absent), `$ARGUMENTS[N]` 0-based (replaced `$ARGUMENTS.0` in v2.1.19), `$N` 0-based shorthand (v2.1.19), `$name` named args via `arguments` frontmatter, `${CLAUDE_SESSION_ID}` (v2.1.9), `${CLAUDE_EFFORT}` (v2.1.120), `${CLAUDE_SKILL_DIR}` (v2.1.69), `\$` escaping (v2.1.163), inline !`cmd` (start-of-line/after-whitespace only) plus multi-line ```! fenced blocks, single-pass substitution. `@file` inclusion is no longer on the main skills page but remains in the Agent SDK docs (https://code.claude.com/docs/en/agent-sdk/slash-commands).
  - Fix: Optional, low priority: if the library ever adds body helpers or lint rules, implement the current 0-based grammar above (and never the obsolete 1-based $1..$n or $ARGUMENTS.0 forms); otherwise document explicitly that bodies are passed through opaquely and substitutions are resolved by Claude Code at invocation time.

- **Skill `disallowed-tools` frontmatter field (new in v2.1.152) not modeled**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: SkillFrontmatter (src/Frontmatter/Skill.ts:41-77) has `allowed-tools` (line 63) but no `disallowed-tools` key. Runtime-verified: the schema is open, so the key decodes without error but is silently dropped — a parseSkillFile -> renderSkill round-trip (src/Frontmatter/Render.ts) strips it from the file.
  - Current: v2.1.152: 'Skills and slash commands can now set disallowed-tools in frontmatter to remove tools from the model while the skill is active' (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md); accepts space/comma-separated string or YAML list (https://code.claude.com/docs/en/skills).
  - Fix: Add `'disallowed-tools': Schema.optional(StringOrStringArray)` to SkillFrontmatter.

- **Skill `when_to_use` field not modeled**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: No `when_to_use` key in SkillFrontmatter (src/Frontmatter/Skill.ts:41-77); the value is silently dropped on decode and lost on render round-trips.
  - Current: Skill frontmatter supports `when_to_use` — additional trigger context appended to `description` in the skill listing, counting toward the 1,536-char listing cap (https://code.claude.com/docs/en/skills, frontmatter reference).
  - Fix: Add `when_to_use: Schema.optional(Schema.String)` (note the snake_case key, unlike the kebab-case neighbors).

- **Skill `arguments` (named positional arguments) field not modeled**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: No `arguments` key in SkillFrontmatter (src/Frontmatter/Skill.ts:41-77); only `argument-hint` (line 64) is modeled. Value silently dropped on decode/round-trip.
  - Current: Skill frontmatter supports `arguments` — named positional arguments for $name substitution; 'Accepts a space-separated string or a YAML list. Names map to argument positions in order.' (https://code.claude.com/docs/en/skills).
  - Fix: Add `arguments: Schema.optional(StringOrStringArray)` to SkillFrontmatter.

- **Agent Skills spec metadata fields `license`, `metadata`, `compatibility` not modeled**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: SkillFrontmatter (src/Frontmatter/Skill.ts:41-77) has none of `license`, `metadata`, or `compatibility`; they decode without error (open schema) but are dropped, so render round-trips strip spec-compliant metadata.
  - Current: The Agent Skills open standard, which Claude Code states it follows, defines optional `license` (license name or bundled-file reference), `metadata` (map of string keys to string values), and `compatibility` (max 500 chars) (https://agentskills.io/specification). Claude Code's own frontmatter reference does not list them as behavioral fields (https://code.claude.com/docs/en/skills) — they are accepted/ignored metadata.
  - Fix: Add optional `license: Schema.String`, `metadata: Schema.Record(Schema.String, Schema.String)`, and `compatibility: Schema.String` so spec-conformant SKILL.md files round-trip losslessly.

- **Skill name/description length and format constraints not encoded**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Skill.ts` · batch verified (high)
  - Library: src/Frontmatter/Skill.ts:45-46 types `name` and `description` as plain Schema.String with no regex, length bound, or directory-name check, so the library validates/emits names the spec rejects (e.g. uppercase, >64 chars, leading hyphen).
  - Current: Agent Skills spec: `name` max 64 chars, lowercase letters/numbers/hyphens only, must not start/end with a hyphen, no consecutive hyphens, must match the parent directory name; `description` max 1024 chars, non-empty (https://agentskills.io/specification). Claude Code itself is laxer (name defaults to dir name) but follows this standard (https://code.claude.com/docs/en/skills).
  - Fix: Add a refined SkillName schema (pattern ^[a-z0-9]+(-[a-z0-9]+)*$, maxLength 64) and a maxLength-1024 description, at minimum as an opt-in strict variant; validate name-matches-directory in src/Plugin/Validate.ts where the skill path is known.

- **Subagent `mcpServers` field not modeled (acknowledged in doc comment but absent from schema)**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: src/Frontmatter/Subagent.ts mentions `mcpServers` in the module doc comment (line 6) as a Claude Code field, but SubagentFrontmatter (lines 41-78) has no `mcpServers` property. Runtime-verified: it decodes without error and is silently dropped, so parse/render round-trips lose agents' MCP server config.
  - Current: Subagent frontmatter supports `mcpServers`: a list whose entries are either strings referencing already-configured servers or inline definitions keyed by server name using the .mcp.json schema (stdio/http/sse/ws); ignored for plugin subagents; honored for --agent main sessions since v2.1.117, covered by managed MCP policies since v2.1.153 (https://code.claude.com/docs/en/sub-agents; https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Add `mcpServers: Schema.optional(Schema.Array(Schema.Union([Schema.String, <inline-server-record>])))`, reusing the looser MCP server entry schema already present in src/Settings/Schema.ts.

- **Subagent `color` field not modeled**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: No `color` key in SubagentFrontmatter (src/Frontmatter/Subagent.ts:41-78); silently dropped on decode and lost on render round-trips.
  - Current: Subagent frontmatter supports `color` with enum values red, blue, green, yellow, purple, orange, pink, cyan (https://code.claude.com/docs/en/sub-agents, frontmatter table).
  - Fix: Add `color: Schema.optional(Schema.Literals(['red','blue','green','yellow','purple','orange','pink','cyan']))`.

- **Subagent `initialPrompt` field (new in v2.1.83) not modeled**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: No `initialPrompt` key in SubagentFrontmatter (src/Frontmatter/Subagent.ts:41-78); silently dropped on decode and lost on render round-trips.
  - Current: v2.1.83 added agent frontmatter `initialPrompt`: an auto-submitted first user turn when the agent runs as a main session via --agent or the agent setting; commands/skills are processed and it is prepended to any user-provided prompt (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md; https://code.claude.com/docs/en/sub-agents).
  - Fix: Add `initialPrompt: Schema.optional(Schema.String)`.

- **Command hook `args` exec form (v2.1.139) not modeled on CommandHookEntry**  
  `/Users/m/repos/effect-claudecode/src/Settings/HooksSection.ts` · batch verified (high)
  - Library: CommandHookEntry (src/Settings/HooksSection.ts:32-42) has command/timeout/async/shell/statusMessage/once but no `args`. Runtime-verified: `{ type: 'command', command: 'c', args: ['a'] }` decodes successfully but `args` is silently stripped from the result.
  - Current: v2.1.139 added the hook `args: string[]` exec form for command hooks (https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md; https://code.claude.com/docs/en/hooks).
  - Fix: Add `args: Schema.optional(Schema.Array(Schema.String))` to CommandHookEntry.


## P2 — Outdated: works today but encodes stale shapes

### Hook events

- **PreToolUse defer() is documented as a neutral 'no opinion' decision, but current defer suspends the tool call for later resumption (headless only)**  
  `src/Hook/Events/PreToolUse.ts` · dual-lens verified (docs + code)
  - Library: defer() JSDoc: "No opinion from this hook — other hooks and the permission system continue to evaluate the tool call" (src/Hook/Events/PreToolUse.ts:142-156); the schema comment repeats "defers to other hooks / Claude Code's permission system" (lines 46-48). Users following this would emit permissionDecision: 'defer' as a passthrough.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks) + CHANGELOG v2.1.89: "defer" "exits gracefully so the tool can be resumed later" — headless (-p) only (interactive sessions log a warning and ignore it), the process exits with stop_reason: "tool_deferred", and precedence is deny > defer > ask > allow. permissionDecisionReason, updatedInput, and additionalContext are all ignored for defer. Using defer() as 'no opinion' in headless mode would actually suspend the tool call and end the turn.
  - Fix: Rewrite the defer()/PermissionDecision JSDoc to describe the real suspend-and-resume semantics (headless-only, stop_reason tool_deferred, reason ignored), and add a true neutral passthrough() helper that emits {} for hooks that have no opinion.

- **PreToolUse matcher/onTool constructors default non-matching tools to allow(), which auto-approves and skips the permission prompt**  
  `src/Hook/Events/PreToolUse.ts` · dual-lens verified (docs + code)
  - Library: onTool/onMatcher/onAdapter default onMismatch to allow() — "Non-matching tool invocations default to allow()" (src/Hook/Events/PreToolUse.ts:218 and the onMismatch defaults around lines 259, 304, 331). PreToolUse exports no empty-output passthrough helper, so allow() is the de-facto neutral.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks): permissionDecision "allow" "skips permission prompt" (deny/ask rules are still evaluated, but tools that would otherwise prompt the user are silently approved). The documented neutral behavior is exit 0 with no decision output. A hook registered with a broad settings.json matcher ("*" or omitted) would auto-approve every tool it was not written for.
  - Fix: Change the onMismatch default to an empty Output ({} on the wire, like the other events' passthrough()) and export a PreToolUse.passthrough() helper; reserve allow() for explicit decisions.

### Hook runner & tooling

- **Typed Bash tool_response adapter encodes {output?, exit_code?} but current Bash responses are {stdout, stderr, interrupted, isImage}**  
  `src/Hook/Tool.ts` · dual-lens verified (docs + code)
  - Library: BashToolResponse is { output?: string, exit_code?: number } (src/Hook/Tool.ts:91-96), used by BashAdapter/decodePostToolUse (lines 126-130, 345-360). Because both fields are optional and decoding ignores excess properties (verified empirically), a real Bash tool_response decodes 'successfully' to an empty object — typed handlers always see undefined output/exit_code. BashToolInput (lines 81-83) also models only command, omitting the documented optional description/timeout/run_in_background.
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks): the Bash tool output shape is { stdout, stderr, interrupted, isImage } (shown verbatim in the PostToolUse updatedToolOutput example), and Bash tool_input is { command, description?, timeout?, run_in_background? }.
  - Fix: Replace BashToolResponse with { stdout?: string, stderr?: string, interrupted?: boolean, isImage?: boolean } (or required per docs) and extend BashToolInput with optional description/timeout/run_in_background; update test fixtures that use output/exit_code.

### Plugin system

- **marketplace.json `owner` modeled as optional, but current docs list it as a required top-level field**  
  `src/Plugin/Marketplace.ts` · batch verified (high)
  - Library: src/Plugin/Marketplace.ts:114 declares `owner: Schema.optional(AuthorInfo)`; empirically `{name: 'm', plugins: []}` with no owner decodes successfully, and the typed constructor permits building marketplace files without an owner.
  - Current: The marketplace.json required top-level fields are `name`, `owner` ({name required, email optional}), and `plugins` (https://code.claude.com/docs/en/plugin-marketplaces).
  - Fix: Make `owner` required on MarketplaceFile so the schema rejects/refuses to construct marketplace files current Claude Code considers invalid.

- **Manifest `skills` paths treated as replacing the default skills/ scan, but current behavior is additive**  
  `src/Plugin/Load.ts` · batch verified (high)
  - Library: expandSkillPathSpec (src/Plugin/Load.ts:269-329) scans the fallback `skills/` directory only when no manifest spec is declared (declared.length === 0 branch at lines 278-293); a declared `skills` spec fully replaces the default scan, mirroring the commands/agents behavior.
  - Current: The `skills` manifest field adds custom skill directories *in addition to* the default `skills/` directory, which is always scanned; only `commands`, `agents`, `outputStyles`, and `experimental.*` replace their defaults (https://code.claude.com/docs/en/plugins-reference).
  - Fix: In expandSkillPathSpec, always scan the default `skills/` directory and union it with the declared spec paths so Plugin.scan/load discover the same skill set current Claude Code loads.

- **Emitted manifest path values lack the documented `./` prefix**  
  `src/Plugin/Layout.ts` · batch verified (high)
  - Library: syncManifest/inferredManifest fill defaults as bare strings — 'commands', 'agents', 'skills', 'output-styles', 'hooks/hooks.json', '.mcp.json' (src/Plugin/Layout.ts:14-19, 48-52, 69-73; src/Plugin/Load.ts:427-439). Verified emitted plugin.json: `{"name": "probe", "commands": "commands", "hooks": "hooks/hooks.json"}`.
  - Current: All manifest custom paths must be relative to the plugin root and start with `./`; absolute paths and `..` traversal are errors, and docs examples consistently use './commands/', './config/hooks.json', etc. (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Either omit the manifest fields entirely when components sit in their default locations (Claude Code auto-discovers them), or emit './'-prefixed values ('./commands/', './hooks/hooks.json', './.mcp.json') to match the documented path format.

- **Plugin.scan/load silently drops a declared `lspServers` manifest field and never discovers the default .lsp.json**  
  `src/Plugin/Load.ts` · batch verified (high)
  - Library: inferredManifest's base copies name/version/description/author/homepage/repository/license/keywords/userConfig/channels from the source manifest but omits lspServers (src/Plugin/Load.ts:411-425), and load builds its definition from inferredManifest (Load.ts:726-736), so load → write rewrites plugin.json without a declared lspServers field. scan has no `.lsp.json` fallback (only hooks/hooks.json and .mcp.json, Load.ts:625, 648), despite the manifest schema accepting lspServers (src/Plugin/Manifest.ts:174).
  - Current: `lspServers` is a current manifest field with default file location `.lsp.json` at the plugin root (config fields: command, extensionToLanguage required; args, transport, env, initializationOptions, settings, workspaceFolder, startupTimeout, maxRestarts, diagnostics optional) (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Carry lspServers through inferredManifest (and write), and add `.lsp.json` as a fallback config path in scan so LSP configuration survives round-trips.

- **commands/ treated as a first-class primary component kind; current docs soft-deprecate it in favor of skills/**  
  `src/Plugin/Define.ts` · batch verified (high)
  - Library: The library models commands as the first component kind with a dedicated Plugin.command constructor, CommandFrontmatter schema, and commands/ as the first write target (src/Plugin/Define.ts:12-22, 680-685; src/Frontmatter/Command.ts:32-40), with no steer toward skills.
  - Current: The default-locations table describes commands/ as 'Skills as flat Markdown files. Use skills/ for new plugins' — commands/ still works but skills/ is the recommended form for new plugins (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Keep commands support but update doc comments/README/examples to recommend Plugin.skill for new plugins, mirroring the docs' guidance.

### Other

- **Stop input models a `custom_instructions` field that does not exist on Stop**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/Stop.ts` · batch verified (high)
  - Library: src/Hook/Events/Stop.ts:27 declares `custom_instructions: Schema.optional(Schema.String)` on Stop Input.
  - Current: Current Stop input fields are stop_hook_active, last_assistant_message, background_tasks, session_crons (plus common fields); `custom_instructions` belongs to PreCompact, not Stop. https://code.claude.com/docs/en/hooks#stop
  - Fix: Remove `custom_instructions` from Stop Input (it will never be populated) and move it to PreCompact Input where it actually arrives. Harmless at runtime since it is optional, but it misleads users into reading a field that is always undefined.
  - Note: custom_instructions belongs on PreCompact input (see the PreCompact finding), not Stop.

- **ElicitationResult input uses stale `user_response` instead of `content`, and misses `action`, `mode`, `elicitation_id`**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/ElicitationResult.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/ElicitationResult.ts:22-30 models Input as envelope + mcp_server_name + optional `user_response` record. Real payloads decode (open schema) but `user_response` is always undefined, so the library's headline use case — inspecting and overriding the user's response (file header lines 4-7) — cannot actually read the response.
  - Current: Current docs (https://code.claude.com/docs/en/hooks#elicitationresult, fetched 2026-06-12): input is mcp_server_name, `action`, optional `mode`, `elicitation_id`, and `content` (the user's form values). Output hookSpecificOutput.action/content overrides (library matches); exit 2 blocks the response and the effective action becomes decline.
  - Fix: Rename `user_response` to `content`, and add `action: Schema.Literals(['accept','decline','cancel'])`, `mode: Schema.optional(...)`, `elicitation_id: Schema.optional(Schema.String)` to Input.

- **TaskCreated/TaskCompleted `block(reason)` stops the whole teammate; actually blocking the task requires exit 2 + stderr, which the library cannot express**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/TaskCreated.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/TaskCreated.ts:40-47 and src/Hook/Events/TaskCompleted.ts:39-40: `block(reason)` returns `{ continue: false, stopReason: reason }`, documented as 'Block the task creation' / file headers say a handler 'can block ... via continue: false'. The runner offers no way to exit 2 with handler-controlled stderr (exit 2 only on decode failure, Runner.ts:283-292).
  - Current: Current docs (https://code.claude.com/docs/en/hooks#taskcreated and #taskcompleted, fetched 2026-06-12; TaskCompleted added 2.1.33, TaskCreated 2.1.84 per changelog): exit code 2 = task not created / not marked completed with stderr fed to the model, while JSON {"continue": false, "stopReason": "..."} stops the teammate entirely. Input field sets (task_id, task_subject, optional task_description/teammate_name/team_name) match the library exactly.
  - Fix: Keep `{continue:false}` but rename it to reflect 'stop the teammate'; add a true block path that exits 2 with the reason written to stderr (requires a runner-level typed result, same mechanism as the TeammateIdle fix). Fix both files' doc comments.

- **Matcher helper assumes all matchers are anchored regex; current semantics are exact/|-list for plain strings, '*'/empty = match-all, and literal filenames for FileChanged**  
  `/Users/m/repos/effect-claudecode/src/Hook/Matcher.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Matcher.ts:3 states 'Claude Code's matcher strings are regex' and matchValue (Matcher.ts:40-44) compiles every string as `new RegExp('^(?:' + pattern + ')$')` — so a user passing the documented match-all matcher '*' throws a RegExp SyntaxError, and FileChanged literal filenames are regex-interpreted.
  - Current: Current docs (https://code.claude.com/docs/en/hooks, matcher section, fetched 2026-06-12): '*', empty string, or omitted = match all; strings containing only [A-Za-z0-9_|] = exact string or |-separated list; anything else = JavaScript regex. FileChanged is special: the matcher is split on '|' and each segment is a LITERAL filename, never regex. This helper is library-side only (Claude Code filters via settings.json before spawning), so impact is limited to in-process onMatcher branching.
  - Fix: Mirror current semantics in matchValue: treat '*'/'' as match-all, treat [A-Za-z0-9_|]-only patterns as exact/|-list comparison, and only fall back to regex otherwise; give FileChanged.onMatcher a literal-filename comparison. Update the module doc.

- **Testing.fixtures defaults are invalid against both the library's own enums and current Claude Code values**  
  `/Users/m/repos/effect-claudecode/src/Testing.ts` · batch verified (high)
  - Library: src/Testing.ts:334 Notification default notification_type:'info'; Testing.ts:385 InstructionsLoaded memory_type:'project' (lowercase); Testing.ts:390 StopFailure error_type:'api_error'; Testing.ts:398 ConfigChange config_source:'settings.json'
  - Current: None of these values exist in the current docs (https://code.claude.com/docs/en/hooks): Notification types are permission_prompt/idle_prompt/auth_success/elicitation_*, memory_type values are capitalized User|Project|Local|Managed, StopFailure errors are rate_limit/overloaded/etc., ConfigChange sources are user_settings/project_settings/local_settings/policy_settings/skills. These fixtures fail the library's own schema decode unless overridden, so the test helpers produce payloads no real Claude Code would send.
  - Fix: Replace the four fixture defaults with documented values (e.g. notification_type:'permission_prompt', memory_type:'Project', error:'rate_limit', source:'user_settings'), updating field names alongside the schema renames.

- **permissions sub-schema uses stale keys (mode, workingDirectories) and lacks current ones**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:34-42 models PermissionsConfig with mode (PermissionMode literal) and workingDirectories ({allowed?, denied?}, :27-32). Probe confirmed: real keys defaultMode and additionalDirectories decode successfully but are silently dropped ({ permissions: { defaultMode: 'plan', additionalDirectories: ['/tmp'] } } -> { permissions: {} }).
  - Current: Current permissions keys: allow, ask, deny, additionalDirectories (string[]), defaultMode (default|acceptEdits|plan|auto|dontAsk|bypassPermissions; auto ignored in project/local since v2.1.142), disableBypassPermissionsMode ('disable'), skipDangerousModePermissionPrompt. No 'mode' or 'workingDirectories' keys exist (https://code.claude.com/docs/en/settings, Permission settings).
  - Fix: Rename mode -> defaultMode (the literal set itself already matches), replace workingDirectories with additionalDirectories: string[], and add disableBypassPermissionsMode and skipDangerousModePermissionPrompt.

- **Top-level 'effort' key with 'max' literal — current key is 'effortLevel' with 'xhigh'**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:143-145 models effort: Schema.Literals(['low','medium','high','max']). The key 'effortLevel' is absent and would be silently dropped on decode (schema is open).
  - Current: The settings key is effortLevel with values low|medium|high|xhigh, written by /effort (https://code.claude.com/docs/en/settings, Available settings table). No 'effort' key and no 'max' value exist.
  - Fix: Rename the field to effortLevel and replace the 'max' literal with 'xhigh'.

- **includeCoAuthoredBy modeled as primary; deprecated in favor of unmodeled 'attribution' object**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts:167 models includeCoAuthoredBy: boolean with no attribution field; an attribution object in a real file is silently dropped on decode.
  - Current: includeCoAuthoredBy is deprecated, superseded by attribution: { commit?: string, pr?: string } (empty string hides; attribution takes precedence when both set) (https://code.claude.com/docs/en/settings, Available settings table and deprecation note).
  - Fix: Add an AttributionConfig class ({ commit?: string, pr?: string }) as the primary field; keep includeCoAuthoredBy with a @deprecated doc tag pointing at attribution.

- **Stale top-level keys: mcpServers, theme, and fastMode are not current settings.json keys**  
  `/Users/m/repos/effect-claudecode/src/Settings/Schema.ts` · batch verified (high)
  - Library: src/Settings/Schema.ts models top-level mcpServers (record, :152-154), theme (string, :149), and fastMode (boolean, :146) as settings.json keys.
  - Current: The current documented settings.json schema has no mcpServers, theme, or fastMode keys: MCP servers live in ~/.claude.json (user/local) and .mcp.json (project); the fast-mode-related key is fastModePerSessionOptIn; theme does not appear in the Available settings table (https://code.claude.com/docs/en/settings).
  - Fix: Remove mcpServers, theme, and fastMode from SettingsFile (or mark @deprecated), and add fastModePerSessionOptIn: boolean. Point MCP consumers at the .mcp.json/.claude.json loaders instead.
  - Note: Correction from verification: fastMode IS a valid current settings key — only mcpServers and theme are stale. Correction from verification: mcpServers and theme are correctly identified as absent from current settings.json (confirmed by JSON schema and docs). However, fastMode IS documented in the JSON schema as a valid boolean field (default false), so the claim that fastMode is not a current settings.json key is wrong. The finding should only flag mcpServers and theme; fastModePerSessionOptIn is a separate additional key, not a replacement for fastMode.

- **Shallow replace-merge diverges from Claude Code's cross-scope array concatenation**  
  `/Users/m/repos/effect-claudecode/src/Settings/Loader.ts` · batch verified (high)
  - Library: src/Settings/Loader.ts:94-97 merges scopes with a shallow object spread — later scopes replace top-level keys wholesale (test 'merge is shallow — nested permissions are replaced, not deep-merged', test/Settings/Loader.test.ts:234-268). A project-scope permissions object therefore wipes out user-scope allow/deny rules.
  - Current: Claude Code merges array-valued settings across scopes by concatenation + dedup (e.g. permissions.allow/ask/deny, sandbox.filesystem.allowWrite, allowedHttpHookUrls); scalars are overridden by higher scope; sole exception fallbackModel, where the highest-precedence file supplies the entire chain (https://code.claude.com/docs/en/settings, Settings precedence).
  - Fix: Replace the spread in mergeSettings with scope-aware merging: concatenate + dedupe known array-valued fields (permission rule lists at minimum), deep-merge known object fields, keep scalar override, and special-case fallbackModel once modeled. Update the test suite accordingly.

- **Library models fields absent from the current contract: `allowedEnvVars` (http) and `cwd` (stdio)**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: `HttpMcpServer` has `allowedEnvVars: Schema.optional(Schema.Array(Schema.String))` described as 'for env substitution' (src/Mcp/Schema.ts:8-9, 117); `StdioMcpServer` has `cwd: Schema.optional(Schema.String)` (src/Mcp/Schema.ts:100). Both are typed, preserved, and emitted by `Plugin.write`.
  - Current: Neither field appears in the current documented server-entry field sets at https://code.claude.com/docs/en/mcp — stdio entries are type/command/args/env/timeout/alwaysLoad; http entries are type/url/headers/headersHelper/oauth/timeout/alwaysLoad. Env substitution is controlled by `${VAR}` expansion syntax, not an allowlist field. Emitted, these fields are at best ignored.
  - Fix: Remove `allowedEnvVars` from `HttpMcpServer` (and the 'env substitution' doc comment). Remove or mark `cwd` as undocumented/legacy unless evidence of current support is found.

- **SSE transport modeled as a current co-equal transport; it is deprecated**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: `SseMcpServer` is presented as one of the 'three transports' Claude Code understands with no deprecation signal (src/Mcp/Schema.ts:4-15, 129-135, 141-143).
  - Current: https://code.claude.com/docs/en/mcp carries the verbatim warning: 'The SSE (Server-Sent Events) transport is deprecated. Use HTTP servers instead, where available.' SSE still functions, so decoding it remains correct, but the library's framing and emission guidance are stale.
  - Fix: Keep `SseMcpServer` decodable but add a `@deprecated`-style note in its JSDoc steering users to `http`, and rewrite the module doc comment (three transports -> stdio/http(+streamable-http alias)/ws, with sse deprecated).

- **Library models commands as a separate, 'lighter' frontmatter schema; Claude Code merged commands into skills with one shared schema, and `.claude/commands/` is legacy**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Command.ts` · batch verified (high)
  - Library: src/Frontmatter/Command.ts:1-7 states 'Their frontmatter is lighter than `SKILL.md` — only the description and a small set of tool/model hints', and CommandFrontmatter (Command.ts:32-40) encodes only 5 keys (description, argument-hint, allowed-tools, disable-model-invocation, model), distinct from SkillFrontmatter. Commands are a first-class plugin component at commands/<name>.md (src/Plugin/Layout.ts:15, src/Plugin/Load.ts:477,599).
  - Current: https://code.claude.com/docs/en/skills — 'Custom commands have been merged into skills' (v2.1.3 per CHANGELOG); 'Files in `.claude/commands/` still work and support the same frontmatter' (i.e., the full skills frontmatter, not a lighter subset); 'if a skill and a command share the same name, the skill takes precedence.' https://code.claude.com/docs/en/agent-sdk/slash-commands labels `.claude/commands/` 'legacy; prefer `.claude/skills/`'. There is no standalone slash-commands schema anymore; /en/slash-commands serves the skills page.
  - Fix: Either unify CommandFrontmatter with the (fixed) skill schema or make it a re-export/alias, and update the Command.ts doc comment to state commands share the full skills frontmatter and that commands/ is the legacy form (skills take precedence on name collision).

- **Subagent schema models a `permissions` object that is not in the current documented subagent contract**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: src/Frontmatter/Subagent.ts:76 includes `permissions: Schema.optional(PermissionsConfig)` (mode/allow/ask/deny/workingDirectories, src/Settings/Schema.ts:34-42), and tests exercise it on subagents (test/Schemas.test.ts user-style fixture with permissions.mode and allow: ['Read(**)']). Render.renderSubagent will emit this key into agent .md files.
  - Current: The current sub-agents frontmatter table lists name, description, tools, disallowedTools, model, permissionMode, maxTurns, skills, mcpServers, hooks, memory, background, effort, isolation, color, initialPrompt — no `permissions` field; the --agents JSON accepted-keys list likewise omits it (https://code.claude.com/docs/en/sub-agents). Permission rules live in settings files, with only `permissionMode` exposed per-agent.
  - Fix: Remove (or deprecate with a doc warning) the `permissions` property from SubagentFrontmatter so the library does not validate/emit a key current Claude Code ignores; update the Schemas.test.ts fixture.


## P3 — Cosmetic

### Hook events

- **PostToolUseFailure docs URL anchor typo (#posttooluseailure)**  
  `src/Hook/Events/PostToolUseFailure.ts` · dual-lens verified (docs + code)
  - Library: Module header links to https://code.claude.com/docs/en/hooks#posttooluseailure — missing the 'f' (src/Hook/Events/PostToolUseFailure.ts:7).
  - Current: The correct anchor on https://code.claude.com/docs/en/hooks is #posttooluseailure → should be #posttoolusefailure.
  - Fix: Fix the anchor to #posttoolusefailure.

### Hook runner & tooling

- **hookTeardown comment overstates exit-2 semantics ('Claude Code halts the pending action') for events where exit 2 does not block**  
  `src/Hook/Runner.ts` · dual-lens verified (docs + code)
  - Library: hookTeardown doc comment: exit 2 is a "blocking error ... Claude Code halts the pending action" applied uniformly to every event on input-decode failure (src/Hook/Runner.ts:269-292).
  - Current: Hooks reference exit-code table (https://code.claude.com/docs/en/hooks): exit 2 blocks only for PreToolUse ("Blocks the tool call") and PermissionRequest ("Denies the permission"); for PostToolUse/PostToolUseFailure it only "Shows stderr to Claude"; for PermissionDenied "Exit code and stderr are ignored". Also "JSON output is only processed on exit 0" and exit 1 does not block.
  - Fix: Correct the comment to enumerate per-event exit-2 behavior, and consider whether input-decode failures on non-blocking events should exit 1 instead of 2 (see the PermissionRequest rules finding for why this matters).

### Plugin system

- **Stale docs URL in Plugin Manifest doc comment**  
  `src/Plugin/Manifest.ts` · batch verified (high)
  - Library: src/Plugin/Manifest.ts:11 cites 'https://docs.claude.com/en/docs/claude-code/plugins-reference' as the authoritative spec (the only plugin-surface file using the old domain; Hook event files already use code.claude.com).
  - Current: The canonical docs location is https://code.claude.com/docs/en/plugins-reference; old docs.claude.com/docs.anthropic.com paths redirect (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Update the doc-comment URL to https://code.claude.com/docs/en/plugins-reference.

### Other

- **InstructionsLoaded memory_type enum includes extra value 'Nested' that current docs do not list**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/InstructionsLoaded.ts` · dual-lens verified (docs + code)
  - Library: src/Hook/Events/InstructionsLoaded.ts:19-25 defines MemoryType = 'User'|'Project'|'Local'|'Managed'|'Nested'; the Tier2 test fixture sends memory_type: 'Nested'. All other fields (file_path, load_reason 5-value enum, globs, trigger_file_path, parent_file_path) match current docs exactly, and the load_reason matcher is correct.
  - Current: Current docs (https://code.claude.com/docs/en/hooks#instructionsloaded, fetched 2026-06-12; event added 2.1.69 per changelog): memory_type is "User"|"Project"|"Local"|"Managed" — nested CLAUDE.md loads are signaled via load_reason: "nested_traversal", not a 'Nested' memory_type. Since Claude Code never sends 'Nested', the extra literal is inert on decode.
  - Fix: Drop 'Nested' from the MemoryType literals and fix the Tier2 test fixture (test/Hook/Events/Tier2.test.ts ~line 205) to use memory_type 'Project' with load_reason 'nested_traversal'.

- **Env-var documentation drift: CLAUDE_ENV_FILE scope understated, CLAUDE_PROJECT_DIR/CLAUDE_PLUGIN_DATA/CLAUDE_EFFORT never mentioned**  
  `/Users/m/repos/effect-claudecode/src/Hook/Events/CwdChanged.ts` · batch verified (medium)
  - Library: src/Hook/Events/CwdChanged.ts:6 mentions $CLAUDE_ENV_FILE only for CwdChanged; ${CLAUDE_PLUGIN_ROOT} appears in examples (examples/plugin-factory.ts:139, README.md:192); CLAUDE_PROJECT_DIR, CLAUDE_PLUGIN_DATA, and $CLAUDE_EFFORT appear nowhere in src/
  - Current: Hooks reference (https://code.claude.com/docs/en/hooks): CLAUDE_ENV_FILE is available to SessionStart, Setup, CwdChanged, and FileChanged hooks; ${CLAUDE_PROJECT_DIR}, ${CLAUDE_PLUGIN_ROOT}, ${CLAUDE_PLUGIN_DATA} are both config placeholders and exported env vars on spawned hook processes; $CLAUDE_EFFORT carries the current effort level (v2.1.133). No functional impact since the library treats command strings opaquely.
  - Fix: Update doc comments to list the full CLAUDE_ENV_FILE event set and mention CLAUDE_PROJECT_DIR/CLAUDE_PLUGIN_DATA/CLAUDE_EFFORT where hook commands are documented; also fix the docs-URL anchor typo '#posttooluseailure' in src/Hook/Events/PostToolUseFailure.ts:7.

- **Examples use unquoted ${CLAUDE_PLUGIN_ROOT} in hook commands; docs recommend quoting**  
  `examples/plugin-factory.ts` · batch verified (high)
  - Library: examples/plugin-factory.ts:139 and examples/plugin-define-complete.ts:74 (and README.md:192) use `bun ${CLAUDE_PLUGIN_ROOT}/hooks/....ts` unquoted in shell-form hook commands; the library itself correctly treats the variable as opaque text for Claude Code to expand.
  - Current: Docs recommend quoting the expansion in shell-form hooks since the installation path can contain spaces: `"\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh"` (https://code.claude.com/docs/en/plugins-reference).
  - Fix: Quote ${CLAUDE_PLUGIN_ROOT} expansions in example/README hook commands per the documented pattern.

- **`timeout` units/semantics undocumented; test fixture value would be ignored by current Claude Code**  
  `/Users/m/repos/effect-claudecode/src/Mcp/Schema.ts` · dual-lens verified (docs + code)
  - Library: `timeout` is `Schema.optional(Schema.Number)` on every variant with no unit or semantics documented (src/Mcp/Schema.ts:101, 118, 133); the canonical test fixture uses `timeout: 30` (test/Mcp/Schema.test.ts:79-89).
  - Current: https://code.claude.com/docs/en/mcp: `timeout` is the per-server tool-execution timeout in milliseconds, overriding `MCP_TOOL_TIMEOUT` for that server (example `"timeout": 600000`); as of v2.1.162, 'Values below 1000 are ignored and fall through to MCP_TOOL_TIMEOUT' (default about 28 hours), so a value of 30 is a no-op.
  - Fix: Document `timeout` as milliseconds for tool execution (sub-1000 values ignored as of v2.1.162) in JSDoc, and change test fixtures to a realistic value like 600000. Optionally add a schema filter or annotation for the >=1000 threshold.

- **Stale doc comment about plugin-agent field restrictions (rejected vs ignored; restricted set shrank in v2.1.78)**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: src/Frontmatter/Subagent.ts:1-9 and 71-74 state plugin-shipped subagents use 'a restricted subset (no hooks, mcpServers, or permissionMode — enforced at runtime)' and that 'Claude Code rejects these at load time for plugin agents'. Schema behavior is unaffected (it accepts the full set).
  - Current: Current docs say permissionMode, mcpServers, and hooks are 'Ignored for plugin subagents' (not rejected at load time), and v2.1.78 explicitly extended effort, maxTurns, and disallowedTools to plugin-shipped agents (https://code.claude.com/docs/en/sub-agents; https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
  - Fix: Reword the doc comment: plugin agents silently ignore permissionMode/mcpServers/hooks; all other fields (including effort, maxTurns, disallowedTools) apply to plugin agents.

- **Subagent `name` format and `memory` enum left as unconstrained strings**  
  `/Users/m/repos/effect-claudecode/src/Frontmatter/Subagent.ts` · batch verified (high)
  - Library: src/Frontmatter/Subagent.ts:45 types `name` as plain Schema.String (docs require lowercase letters and hyphens) and line 68 types `memory` as plain Schema.String. Both are permissive in the safe direction: all currently-valid values decode; invalid ones are not caught.
  - Current: Subagent `name` is 'Unique identifier using lowercase letters and hyphens'; `memory` is an enum of `user`, `project`, `local` mapping to ~/.claude/agent-memory/<name>/, .claude/agent-memory/<name>/, and .claude/agent-memory-local/<name>/ respectively (https://code.claude.com/docs/en/sub-agents).
  - Fix: Optionally tighten: name pattern ^[a-z]+(-[a-z]+)*$ and memory Schema.Literals(['user','project','local']) — or document the deliberate openness as is done for `isolation`.


## Additional risks (completeness critic)

- **MCP policy/effective configuration needs follow-up verification.** Effective MCP server resolution now covers `~/.claude.json` local/user scopes, project `.mcp.json`, plugin configs, managed MCP, and reserved-name handling. Remaining MCP risk is mostly around deeper enterprise policy behavior and future Claude Code field additions.
- **Plugin write/scan still trails current layout.** Root-level `SKILL.md` discovery is implemented, but `Plugin.write` and `Plugin.scan` still need full support for newer components such as `bin/`, plugin-root `settings.json`, `monitors/`, `themes/`, and `.lsp.json` fallback discovery.
- **Examples and docs can still teach stale patterns.** README/examples still need cleanup for quoted `${CLAUDE_PLUGIN_ROOT}` paths and for steering new plugin authors toward `skills/` over legacy `commands/`.
- **Test coverage lags modeled surface.** The implementation now models many current fields, but several newly added settings, hook-entry, and event schemas lack dedicated fixture tests.

## Checked and refuted — library is correct, no change needed

- **replaceMcpOutput emits soft-deprecated updatedMCPToolOutput as the only output-replacement path** — refuted: the original finding's claim about current docs was inaccurate. The current docs still support `updatedMCPToolOutput`; the library also now exposes universal `updatedToolOutput` separately.

## Superseded refutations

- **FileChanged input shape.** The earlier refutation that claimed FileChanged still used `change_type: created|modified|deleted` is obsolete. Live `https://code.claude.com/docs/en/hooks.md` fetched during the current status review documents `file_path` plus `event: "change" | "add" | "unlink"`. The current source follows that shape. Remaining work is matcher semantics, not input shape.

## Coverage

Surfaces audited: hook events (tool / session / misc tiers, all 30 current events), hook runner mechanics (envelope, exit codes, matchers, tool adapters, transcript, env vars), settings.json schema + loader precedence, plugin system (manifest, layout, load/scan, marketplace, validate, define/write), `.mcp.json` and MCP scope/config gaps, frontmatter (commands, output styles, skills, subagents), and testing helpers/fixtures. Not audited in depth: ClaudeRuntime presets and non-schema ClaudeProject service internals.
