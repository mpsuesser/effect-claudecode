/**
 * Aggregate re-exports for every Hook event namespace, plus the
 * `HookInput` discriminated union keyed on `hook_event_name` for
 * cross-event pattern matching and dispatch.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// Tier 1
import * as Notification from './Notification.ts';
import * as PostToolUse from './PostToolUse.ts';
import * as PreCompact from './PreCompact.ts';
import * as PreToolUse from './PreToolUse.ts';
import * as SessionEnd from './SessionEnd.ts';
import * as SessionStart from './SessionStart.ts';
import * as Stop from './Stop.ts';
import * as SubagentStop from './SubagentStop.ts';
import * as UserPromptSubmit from './UserPromptSubmit.ts';

// Tier 2
import * as ConfigChange from './ConfigChange.ts';
import * as CwdChanged from './CwdChanged.ts';
import * as FileChanged from './FileChanged.ts';
import * as InstructionsLoaded from './InstructionsLoaded.ts';
import * as PermissionDenied from './PermissionDenied.ts';
import * as PermissionRequest from './PermissionRequest.ts';
import * as PostCompact from './PostCompact.ts';
import * as PostToolUseFailure from './PostToolUseFailure.ts';
import * as StopFailure from './StopFailure.ts';
import * as SubagentStart from './SubagentStart.ts';

// Tier 3
import * as Elicitation from './Elicitation.ts';
import * as ElicitationResult from './ElicitationResult.ts';
import * as TaskCompleted from './TaskCompleted.ts';
import * as TaskCreated from './TaskCreated.ts';
import * as TeammateIdle from './TeammateIdle.ts';
import * as WorktreeCreate from './WorktreeCreate.ts';
import * as WorktreeRemove from './WorktreeRemove.ts';

// ---------------------------------------------------------------------------
// Per-event namespaces
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
	WorktreeRemove
};

// ---------------------------------------------------------------------------
// Unions (all 26 events)
// ---------------------------------------------------------------------------

/**
 * Discriminated union of every hook event input supported by
 * effect-claudecode, keyed on `hook_event_name`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const HookInput = Schema.Union([
	// Tier 1
	PreToolUse.Input,
	PostToolUse.Input,
	UserPromptSubmit.Input,
	Notification.Input,
	Stop.Input,
	SubagentStop.Input,
	SessionStart.Input,
	SessionEnd.Input,
	PreCompact.Input,
	// Tier 2
	PostCompact.Input,
	PermissionRequest.Input,
	PermissionDenied.Input,
	PostToolUseFailure.Input,
	SubagentStart.Input,
	ConfigChange.Input,
	InstructionsLoaded.Input,
	StopFailure.Input,
	CwdChanged.Input,
	FileChanged.Input,
	// Tier 3
	TaskCreated.Input,
	TaskCompleted.Input,
	TeammateIdle.Input,
	WorktreeCreate.Input,
	WorktreeRemove.Input,
	Elicitation.Input,
	ElicitationResult.Input
]).annotate({
	identifier: 'HookInput',
	description:
		'Union of all hook event inputs, discriminated on hook_event_name'
});

export type HookInput = Schema.Schema.Type<typeof HookInput>;

/**
 * Every hook event name currently supported by the library.
 *
 * @category Schemas
 * @since 0.1.0
 */
export type HookEventName = HookInput['hook_event_name'];
