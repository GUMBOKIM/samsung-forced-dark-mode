import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convert, isDarkIconColor, shapeRole, type RGB } from '../src/color.ts';

// Every expected value below was read from Samsung Internet 31.0 on a phone.

test('SVG shapes under 20px are inverted inside the SVG range', () => {
	const measured: [RGB, number][] = [
		[[0, 0, 0], 179],
		[[64, 64, 64], 166],
		[[128, 128, 128], 153],
		[[192, 192, 192], 140],
		[[216, 216, 216], 135],
		[[255, 255, 255], 179],
	];
	for (const [color, gray] of measured) assert.ok(Math.abs(convert(color, 'svgSmall')[0] - gray) <= 1, `${color} should become ${gray}`);
});

test('an SVG shape takes its role from its painted size', () => {
	assert.equal(shapeRole('rect', 19, 19), 'svgSmall');
	assert.equal(shapeRole('ellipse', 19, 19), 'svgSmall');
	assert.equal(shapeRole('rect', 20, 20), 'svg');
	assert.equal(shapeRole('rect', 19, 20), 'svg');
	assert.equal(shapeRole('rect', 16, 40), 'svg');
	assert.equal(shapeRole('rect', 89, 89), 'svg');
	assert.equal(shapeRole('rect', 90, 90), 'button');
	assert.equal(shapeRole('rect', 16, 100), 'button');
	assert.equal(shapeRole('circle', 96, 96), 'button');
});

test('a path never gets the large shape role', () => {
	assert.equal(shapeRole('path', 96, 96), 'svg');
	assert.equal(shapeRole('path', 16, 16), 'svgSmall');
});

test('large SVG shapes use the button range', () => {
	assert.deepEqual(convert([0, 0, 0], 'button').map((v) => Math.abs(v - 38) <= 1), [true, true, true]);
	assert.ok(Math.abs(convert([255, 255, 255], 'button')[0] - 74) <= 1);
});

test('dark icon colors match what the phone brightened', () => {
	const brightened: RGB[] = [[0, 0, 0], [124, 124, 124], [112, 112, 120], [64, 64, 128], [32, 32, 160], [128, 0, 0], [0, 0, 128], [0, 64, 0]];
	const dimmed: RGB[] = [[128, 128, 128], [80, 80, 96], [96, 96, 112], [64, 64, 192], [0, 128, 0], [255, 0, 0], [26, 115, 232], [156, 39, 176]];
	for (const color of brightened) assert.equal(isDarkIconColor(color), true, String(color));
	for (const color of dimmed) assert.equal(isDarkIconColor(color), false, String(color));
});
