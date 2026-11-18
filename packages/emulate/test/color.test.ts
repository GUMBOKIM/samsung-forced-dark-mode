import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert, type RGB, type Role } from '../src/color.ts';
import { hasVisibleColor, parseRgb, rewriteColors } from '../src/css-color.ts';

/** 256 gray levels per paint target, measured on Samsung Internet 31.0 */
const measured = JSON.parse(readFileSync(new URL('./measured.json', import.meta.url), 'utf8')) as Record<string, number[]>;

const CURVES: Record<string, Role> = {
	background: 'background',
	input: 'field',
	button: 'button',
	gradient: 'gradient',
	outline: 'outline',
	border: 'border',
	shadow: 'shadow',
	'svg-rect': 'svg',
	text: 'text',
	'img-png': 'image',
	'bg-png': 'bgimage',
};

for (const [key, role] of Object.entries(CURVES)) {
	test(`${key} matches all 256 measured grays within 1`, () => {
		const curve = measured[key];
		assert.equal(curve?.length, 256);
		curve?.forEach((expected, gray) => {
			const [out] = convert([gray, gray, gray], role);
			assert.ok(Math.abs(out - expected) <= 1, `gray ${gray}: got ${out}, measured ${expected}`);
		});
	});
}

const COLORS: [RGB, Role, RGB][] = [
	[[254, 229, 0], 'background', [69, 44, 0]],
	[[255, 87, 20], 'background', [142, 0, 0]],
	[[26, 115, 232], 'background', [0, 26, 143]],
	[[254, 229, 0], 'field', [81, 56, 0]],
	[[254, 229, 0], 'button', [111, 86, 1]],
	[[254, 229, 0], 'text', [149, 124, 0]],
	[[255, 87, 20], 'text', [255, 120, 53]],
	[[26, 115, 232], 'text', [107, 196, 255]],
];

for (const [input, role, expected] of COLORS) {
	test(`rgb(${input}) as ${role} matches the measured color within 3`, () => {
		convert(input, role).forEach((channel, i) => {
			assert.ok(Math.abs(channel - (expected[i] ?? 0)) <= 3, `channel ${i}: got ${channel}, measured ${expected[i]}`);
		});
	});
}

test('text flips between gray 216 and 217', () => {
	assert.equal(convert([216, 216, 216], 'text')[0], 102);
	assert.equal(convert([217, 217, 217], 'text')[0], 228);
});

test('parses both rgb notations', () => {
	assert.deepEqual(parseRgb('rgb(1, 2, 3)'), { rgb: [1, 2, 3], alpha: 1 });
	assert.deepEqual(parseRgb('rgba(1, 2, 3, 0.5)'), { rgb: [1, 2, 3], alpha: 0.5 });
	assert.deepEqual(parseRgb('rgb(1 2 3 / 50%)'), { rgb: [1, 2, 3], alpha: 0.5 });
	assert.equal(parseRgb('oklch(0.5 0.1 200)'), null);
});

test('rewrites every color in a shadow list and keeps alpha', () => {
	assert.equal(
		rewriteColors('rgb(255, 255, 255) 0px 1px 2px 0px, rgba(0, 0, 0, 0.5) 0px 0px 4px 0px', 'shadow'),
		'rgb(84, 84, 84) 0px 1px 2px 0px, rgba(71, 71, 71, 0.5) 0px 0px 4px 0px',
	);
});

test('leaves fully transparent colors alone', () => {
	assert.equal(rewriteColors('rgba(0, 0, 0, 0)', 'background'), 'rgba(0, 0, 0, 0)');
	assert.equal(hasVisibleColor('rgba(0, 0, 0, 0)'), false);
	assert.equal(hasVisibleColor('none'), false);
	assert.equal(hasVisibleColor('rgb(0, 0, 0)'), true);
});
