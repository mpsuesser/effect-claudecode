import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		setupFiles: [`${import.meta.dirname}/vitest.setup.ts`],
		include: ['test/**/*.test.ts'],
		passWithNoTests: true,
		globals: false,
		testTimeout: 30000,
		hookTimeout: 30000,
		pool: 'forks',
		isolate: false
	}
});
