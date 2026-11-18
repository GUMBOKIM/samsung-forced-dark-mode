import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, detectForcedDark, samsungVersion } from '../src/index.ts';

const SAMSUNG =
	'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/31.0 Chrome/148.0.0.0 Mobile Safari/537.36';
const CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';

test('reads the Samsung Internet version', () => {
	assert.equal(samsungVersion(SAMSUNG), '31.0');
	assert.equal(samsungVersion(CHROME), null);
});

test('a dimmed sample on Samsung Internet is forced dark', () => {
	assert.deepEqual(classify(SAMSUNG, 179), {
		state: 'forced',
		forced: true,
		samsungBrowser: true,
		version: '31.0',
		sample: 179,
	});
});

test('an untouched sample on Samsung Internet is not forced dark', () => {
	const result = classify(SAMSUNG, 255);
	assert.equal(result.state, 'not-forced');
	assert.equal(result.forced, false);
});

test('the threshold is exclusive', () => {
	assert.equal(classify(SAMSUNG, 249).state, 'forced');
	assert.equal(classify(SAMSUNG, 250).state, 'not-forced');
});

test('a failed read is unknown, never forced', () => {
	const result = classify(SAMSUNG, null);
	assert.equal(result.state, 'unknown');
	assert.equal(result.forced, false);
});

test('other browsers are never reported as forced', () => {
	assert.equal(classify(CHROME, 179).state, 'not-samsung');
	assert.equal(classify(CHROME, 179).forced, false);
});

test('detection is safe outside a browser', async () => {
	assert.equal((await detectForcedDark({ userAgent: SAMSUNG })).state, 'unknown');
	assert.equal((await detectForcedDark({ userAgent: CHROME })).state, 'not-samsung');
});
