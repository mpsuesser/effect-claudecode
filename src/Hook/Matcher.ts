/**
 * Matcher helpers for hooks that support a `matcher` field in settings.json.
 *
 * Claude Code's matcher strings are regex. These helpers compile and test
 * them so individual hooks can branch on whether the incoming event
 * matches. They are NOT required — the `matcher` field in settings.json
 * filters hooks at Claude Code's side before the process is even spawned.
 * Use these when you dispatch many events from one script and need to
 * branch within a single handler.
 *
 * @since 0.1.0
 */

// ---------------------------------------------------------------------------
// Matchers
// ---------------------------------------------------------------------------

/**
 * Compile a matcher pattern into a tester function. Accepts either a
 * regex pattern string (matched with `^pattern$` anchoring) or a full
 * `RegExp`.
 *
 * @category Matcher
 * @since 0.1.0
 * @example
 * ```ts
 * import { Hook } from 'effect-claudecode'
 *
 * const isBash = Hook.matchTool('Bash')
 * const isEditOrWrite = Hook.matchTool('Edit|Write')
 * const isMcp = Hook.matchTool('mcp__.*')
 *
 * isBash('Bash')       // true
 * isBash('Bash(git)')  // false — anchored match
 * isMcp('mcp__foo')    // true
 * ```
 */
export const matchTool = (pattern: string | RegExp): ((name: string) => boolean) => {
	const regex =
		pattern instanceof RegExp ? pattern : new RegExp(`^(?:${pattern})$`);
	return (name: string) => regex.test(name);
};

/**
 * Test whether a regex pattern matches a tool name, one-shot.
 *
 * @category Matcher
 * @since 0.1.0
 */
export const testTool = (pattern: string | RegExp, name: string): boolean =>
	matchTool(pattern)(name);
