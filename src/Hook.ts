/**
 * Hook module hub — re-exports the runner, context service, envelope,
 * matcher helpers, transcript reader, and every hook event namespace.
 *
 * Users import this as a namespace: `import { Hook } from 'effect-claudecode'`
 * and access members as `Hook.PreToolUse`, `Hook.runMain`, `Hook.dispatch`,
 * `Hook.Context`, `Hook.matchTool`, `Hook.readTranscript`, etc.
 *
 * @since 0.1.0
 */

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export {
	dispatch,
	hookTeardown,
	runDispatchProgram,
	runHookProgram,
	runMain,
	type DispatchMap,
	type HookDefinition
} from './Hook/Runner.ts';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export { HookContext } from './Hook/Context.ts';
export {
	cwd,
	hookEventName,
	permissionMode,
	sessionId,
	transcriptPath
} from './Hook/Context.ts';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export { HookEnvelope, envelopeFields } from './Hook/Envelope.ts';

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

export { matchTool, testTool } from './Hook/Matcher.ts';

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export { readTranscript } from './Hook/Transcript.ts';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export {
	// Tier 1
	Notification,
	PostToolUse,
	PreCompact,
	PreToolUse,
	SessionEnd,
	SessionStart,
	Stop,
	SubagentStop,
	UserPromptSubmit,
	// Tier 2
	ConfigChange,
	CwdChanged,
	FileChanged,
	InstructionsLoaded,
	PermissionDenied,
	PermissionRequest,
	PostCompact,
	PostToolUseFailure,
	StopFailure,
	SubagentStart,
	// Tier 3
	Elicitation,
	ElicitationResult,
	TaskCompleted,
	TaskCreated,
	TeammateIdle,
	WorktreeCreate,
	WorktreeRemove,
	// Unions
	HookInput,
	type HookEventName
} from './Hook/Events/index.ts';
