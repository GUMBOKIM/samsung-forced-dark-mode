// Builds the ES modules, the script tag builds, and the bookmarklet into dist/.
import { build } from 'esbuild';
import { rm, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

const shared = { bundle: true, target: 'es2020', legalComments: 'none', logLevel: 'warning' };
const DETECT = 'packages/detect/src/index.ts';
const EMULATE = 'packages/emulate/src/index.ts';

await Promise.all([
	build({ ...shared, entryPoints: [DETECT], format: 'esm', outfile: 'dist/detect.js' }),
	build({ ...shared, entryPoints: [EMULATE], format: 'esm', outfile: 'dist/emulate.js' }),
	build({ ...shared, entryPoints: [DETECT], format: 'iife', globalName: 'SamsungForcedDarkDetect', minify: true, outfile: 'dist/detect.global.js' }),
	build({ ...shared, entryPoints: [EMULATE], format: 'iife', globalName: 'SamsungForcedDarkEmulate', minify: true, outfile: 'dist/emulate.global.js' }),
	build({ ...shared, entryPoints: ['packages/emulate/src/auto.ts'], format: 'iife', minify: true, outfile: 'dist/samsung-dark.auto.js' }),
]);

const auto = (await readFile('dist/samsung-dark.auto.js', 'utf8')).trim();
await writeFile('dist/bookmarklet.txt', `javascript:${encodeURIComponent(auto)}\n`);
