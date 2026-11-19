// Compares the phone captures with the emulator captures and prints the color error per element kind.
import { readFileSync, writeFileSync } from 'node:fs';
import { readPng } from './png.mjs';

const OUT = new URL('./out/', import.meta.url);
const path = (name) => new URL(name, OUT).pathname;

/** Phone screenshots are saved in Display P3, so colors are moved to sRGB before comparing */
const P3_TO_SRGB = [
	[1.2249, -0.2247, 0],
	[-0.042, 1.0419, 0],
	[-0.0197, -0.0786, 1.0979],
];
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const toSrgb = (rgb) => {
	const linear = rgb.map((v) => decode(v / 255));
	return P3_TO_SRGB.map((row) => Math.round(255 * encode(Math.min(1, Math.max(0, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])))));
};
const error = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const hex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * The phone capture starts with blank space where the browser toolbar sits. Canvas cells are never
 * converted, so the vertical offset is the one that puts them on their known colors.
 */
function findOffset(phone, cells, scale) {
	const control = cells.filter((cell) => cell.kind === 'canvas');
	const known = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
	const costs = [];
	for (let offset = 0; offset < phone.height - 601 * scale; offset++) {
		costs.push(control.reduce((sum, cell) => sum + error(toSrgb(phone.at(cell.x * scale, cell.y * scale + offset)), known(cell.color)), 0));
	}
	// Every offset that keeps the samples inside their cells costs the same, so take the middle one.
	const lowest = Math.min(...costs);
	const start = costs.findIndex((cost) => cost <= lowest + control.length);
	let end = start;
	while (costs[end + 1] !== undefined && costs[end + 1] <= lowest + control.length) end++;
	return Math.round((start + end) / 2);
}

const rows = [];
let pageOffset = 0;
for (const name of ['fixture-0', 'fixture-1']) {
	const phone = readPng(path(`${name}.phone.png`));
	const emulated = readPng(path(`${name}.emulated.png`));
	const scale = phone.width / emulated.width;
	const { cells } = JSON.parse(readFileSync(path(`${name}.phone.json`), 'utf8'));
	const offset = findOffset(phone, cells, scale);
	pageOffset = offset;
	for (const { kind, color, x, y } of cells) {
		const real = toSrgb(phone.at(x * scale, y * scale + offset));
		// The emulator side is captured by headless Chrome with --force-color-profile=srgb.
		const mine = emulated.at(x, y);
		rows.push({ kind, color, real, mine, error: error(real, mine) });
	}
}

const control = rows.filter((row) => row.kind === 'canvas');
const noise = Math.max(...control.map((row) => row.error));
const summary = [...new Set(rows.map((row) => row.kind))].map((kind) => {
	const group = rows.filter((row) => row.kind === kind);
	const worst = group.reduce((a, b) => (b.error > a.error ? b : a));
	return {
		kind,
		cells: group.length,
		mean: +(group.reduce((sum, row) => sum + row.error, 0) / group.length).toFixed(1),
		max: worst.error,
		within5: group.filter((row) => row.error <= 5).length,
		worst: `${worst.color} real ${hex(worst.real)} emulated ${hex(worst.mine)}`,
	};
});

const measured = rows.filter((row) => row.kind !== 'canvas');
const count = (limit) => measured.filter((row) => row.error <= limit).length;
console.log(`control error from the screenshot color conversion: up to ${noise}`);
console.table(summary);
console.log(`cells within 5 per channel: ${count(5)} of ${measured.length} (${((count(5) / measured.length) * 100).toFixed(1)}%)`);
console.log(`cells within 10 per channel: ${count(10)} of ${measured.length} (${((count(10) / measured.length) * 100).toFixed(1)}%)`);

const phone = readPng(path('page.phone.png'));
const emulated = readPng(path('page.emulated.png'));
const scale = phone.width / emulated.width;
const height = Math.min(JSON.parse(readFileSync(path('page.phone.json'), 'utf8')).height, emulated.height);
const tallies = { 5: 0, 10: 0, 20: 0 };
let total = 0;
for (let y = 0; y < height; y++) {
	for (let x = 0; x < emulated.width; x++) {
		const difference = error(toSrgb(phone.at(x * scale + 1, y * scale + 1 + pageOffset)), emulated.at(x, y));
		for (const limit of Object.keys(tallies)) if (difference <= Number(limit)) tallies[limit]++;
		total++;
	}
}
const page = Object.fromEntries(Object.entries(tallies).map(([limit, value]) => [`within${limit}`, +((value / total) * 100).toFixed(2)]));
console.log(`whole page, ${emulated.width}x${height} pixels, % of pixels within N per channel:`, page);
writeFileSync(path('report.json'), JSON.stringify({ noise, summary, page, rows }, null, 1));
