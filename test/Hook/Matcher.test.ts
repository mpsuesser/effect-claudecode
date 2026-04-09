/**
 * Tests for the matcher helpers used by hooks that dispatch internally
 * on tool name.
 *
 * @since 0.1.0
 */
import { describe, expect, test } from '@effect/vitest';

import { matchTool, testTool } from '../../src/Hook/Matcher.ts';

describe('Hook.matchTool', () => {
	test('exact match anchors at both ends', () => {
		const isBash = matchTool('Bash');
		expect(isBash('Bash')).toBe(true);
		expect(isBash('Bash(git)')).toBe(false);
		expect(isBash('xBash')).toBe(false);
	});

	test('alternation', () => {
		const isEditOrWrite = matchTool('Edit|Write');
		expect(isEditOrWrite('Edit')).toBe(true);
		expect(isEditOrWrite('Write')).toBe(true);
		expect(isEditOrWrite('Read')).toBe(false);
	});

	test('prefix via wildcard', () => {
		const isMcp = matchTool('mcp__.*');
		expect(isMcp('mcp__memory__create')).toBe(true);
		expect(isMcp('notmcp')).toBe(false);
	});

	test('accepts a RegExp literal', () => {
		const isBashStrict = matchTool(/^Bash$/);
		expect(isBashStrict('Bash')).toBe(true);
		expect(isBashStrict('Bash(git)')).toBe(false);
	});

	test('testTool is a one-shot form', () => {
		expect(testTool('Bash', 'Bash')).toBe(true);
		expect(testTool('Bash', 'Read')).toBe(false);
	});
});
