import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const relativeTypeScriptImport = /(['"])(\.{1,2}\/[^'"]+)\.(?:cts|mts|ts|tsx)(['"])/g;

const walk = async (directory) => {
	const entries = await readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			await walk(path);
			continue;
		}

		if (!entry.name.endsWith('.d.ts')) {
			continue;
		}

		const source = await readFile(path, 'utf8');
		const rewritten = source.replace(
			relativeTypeScriptImport,
			'$1$2.js$3'
		);

		if (rewritten !== source) {
			await writeFile(path, rewritten);
		}
	}
};

await walk(distDir);
