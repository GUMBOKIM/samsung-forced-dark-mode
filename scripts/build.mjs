// Builds the ES modules, the script tag builds, and the bookmarklet into dist/.
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

await rm('dist', { recursive: true, force: true });

const shared = { bundle: true, target: 'es2020', legalComments: 'none', logLevel: 'warning' };
const DETECT = 'packages/detect/src/index.ts';
const EMULATE = 'packages/emulate/src/index.ts';

await Promise.all([
	build({ ...shared, entryPoints: [DETECT], format: 'esm', outfile: 'dist/detect.js' }),
	build({ ...shared, entryPoints: [EMULATE], format: 'esm', outfile: 'dist/emulate.js' }),
	build({ ...shared, entryPoints: [DETECT], format: 'iife', globalName: 'SamsungForcedDarkDetect', minify: true, outfile: 'dist/detect.global.js' }),
	build({ ...shared, entryPoints: [EMULATE], format: 'iife', globalName: 'SamsungForcedDarkEmulate', minify: true, outfile: 'dist/emulate.global.js' }),
	build({ ...shared, entryPoints: ['packages/emulate/src/auto.ts'], format: 'iife', minify: true, outfile: 'dist/samsung-forced-dark-mode.auto.js' }),
]);

const auto = (await readFile('dist/samsung-forced-dark-mode.auto.js', 'utf8')).trim();
await writeFile('dist/bookmarklet.txt', `javascript:${encodeURIComponent(auto)}\n`);

/** Joins modules into one TypeScript file. Only the last module keeps its public exports. */
async function singleFile(outfile, modules) {
	const parts = await Promise.all(modules.map((path) => readFile(path, 'utf8')));
	const joined = parts.map((source, index) => {
		const entry = index === parts.length - 1;
		const local = source.replace(/^import [\s\S]*?from '\.\/[^']+';\n/gm, '');
		if (entry) return local.replace(/^export ((?:type )?\{[^}]*\}) from '\.\/[^']+';$/gm, 'export $1;');
		return local.replace(/^export (?=const |function |async |type |interface )/gm, '');
	});
	await writeFile(outfile, `${joined.join('\n').trim()}\n`);
}

await singleFile('dist/detect.ts', [DETECT]);
await singleFile('dist/emulate.ts', ['packages/emulate/src/color.ts', 'packages/emulate/src/css-color.ts', 'packages/emulate/src/image.ts', EMULATE]);

// Compiling the joined files also proves that they work without the rest of the source tree.
execFileSync(
	'npx',
	['tsc', '--ignoreConfig', 'dist/detect.ts', 'dist/emulate.ts', '--declaration', '--emitDeclarationOnly', '--outDir', 'dist', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--lib', 'dom,dom.iterable,es2022', '--strict', '--noUncheckedIndexedAccess', '--skipLibCheck', '--types', ''],
	{ stdio: 'inherit' },
);

/** Draws the icon: a circle that is light on the left and dark on the right, like a page going dark */
function icon(size) {
	const rgba = Buffer.alloc(size * size * 4);
	const samples = 4;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const color = [0, 0, 0, 0];
			for (let sy = 0; sy < samples; sy++) {
				for (let sx = 0; sx < samples; sx++) {
					const px = (x + (sx + 0.5) / samples) / size - 0.5;
					const py = (y + (sy + 0.5) / samples) / size - 0.5;
					const corner = Math.max(Math.abs(px), Math.abs(py)) <= 0.5 && Math.hypot(Math.max(Math.abs(px) - 0.32, 0), Math.max(Math.abs(py) - 0.32, 0)) <= 0.18;
					if (!corner) continue;
					const inCircle = Math.hypot(px, py) <= 0.3;
					const paint = inCircle ? (px < 0 ? [246, 248, 250] : [31, 31, 31]) : [26, 115, 232];
					for (let c = 0; c < 3; c++) color[c] += paint[c];
					color[3] += 255;
				}
			}
			const hits = color[3] / 255;
			const offset = (y * size + x) * 4;
			for (let c = 0; c < 3; c++) rgba[offset + c] = hits ? Math.round(color[c] / hits) : 0;
			rgba[offset + 3] = Math.round(color[3] / (samples * samples));
		}
	}
	const table = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (bytes) => {
		let c = 0xffffffff;
		for (const byte of bytes) c = table[(c ^ byte) & 255] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type, data) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const head = Buffer.alloc(4);
		head.writeUInt32BE(data.length);
		const tail = Buffer.alloc(4);
		tail.writeUInt32BE(crc(body));
		return Buffer.concat([head, body, tail]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8;
	header[9] = 6;
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// The Chrome extension: load dist/extension as an unpacked extension.
await cp('extension', 'dist/extension', { recursive: true });
await cp('dist/emulate.global.js', 'dist/extension/emulate.js');
await mkdir('dist/extension/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) await writeFile(`dist/extension/icons/${size}.png`, icon(size));
