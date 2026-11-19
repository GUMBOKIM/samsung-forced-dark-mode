// Renders the Chrome Web Store screenshots into store/. Needs `npm run build`, the local server
// on port 5177, and a phone capture in compare/out/page.phone.png from compare/phone.mjs.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { readPng } from '../../compare/png.mjs';

const ROOT = new URL('../../', import.meta.url);
const PORT = 9563;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function writePng(path, width, height, rgb) {
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
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	const raw = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
	writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** The phone capture is Display P3 at 3x with the toolbar on top, so it is cropped, scaled and moved to sRGB */
function phoneShot(out) {
	const phone = readPng(new URL('compare/out/page.phone.png', ROOT).pathname);
	const P3 = [[1.2249, -0.2247, 0], [-0.042, 1.0419, 0], [-0.0197, -0.0786, 1.0979]];
	const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
	const width = 360;
	const height = 600;
	const rgb = Buffer.alloc(width * height * 3);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = phone.at(x * 3 + 1, y * 3 + 1 + 247);
			const linear = [p[0], p[1], p[2]].map((v) => dec(v / 255));
			P3.forEach((row, i) => (rgb[(y * width + x) * 3 + i] = Math.round(255 * enc(Math.min(1, Math.max(0, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2]))))));
		}
	}
	writePng(out, width, height, rgb);
}

const connect = (url) =>
	new Promise((resolve) => {
		const socket = new WebSocket(url);
		let id = 0;
		const waiting = new Map();
		socket.onmessage = ({ data }) => {
			const message = JSON.parse(data);
			waiting.get(message.id)?.(message.result ?? message);
			waiting.delete(message.id);
		};
		socket.onopen = () => resolve({ send: (method, params = {}) => new Promise((done) => { const current = ++id; waiting.set(current, done); socket.send(JSON.stringify({ id: current, method, params })); }), close: () => socket.close() });
	});

const profile = mkdtempSync(join(tmpdir(), 'sfd-store-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-color-profile=srgb'], { stdio: 'ignore' });
const capture = async (url, width, height, out, { autoDark = false, scale = 1 } = {}) => {
	const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
	const page = await connect(target.webSocketDebuggerUrl);
	await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
	if (autoDark) await page.send('Emulation.setAutoDarkModeOverride', { enabled: true });
	await page.send('Page.navigate', { url });
	await wait(3500);
	const shot = await page.send('Page.captureScreenshot', { format: 'png' });
	writeFileSync(out, Buffer.from(shot.data, 'base64'));
	page.close();
	await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
};

try {
	await wait(2500);
	const build = new URL('store/build/', ROOT).pathname;
	phoneShot(`${build}samsung.png`);
	await capture('http://localhost:5177/compare/page.html', 360, 600, `${build}original.png`);
	await capture('http://localhost:5177/compare/page.html?emulate=1', 360, 600, `${build}preview.png`);
	await capture('http://localhost:5177/compare/page.html', 360, 600, `${build}chrome-auto-dark.png`, { autoDark: true });
	for (const [name, width, height] of [['screenshot-1', 1280, 800], ['screenshot-2', 1280, 800], ['promo-small', 440, 280]]) {
		await capture(`http://localhost:5177/store/build/${name}.html`, width, height, new URL(`store/${name}.png`, ROOT).pathname);
	}
} finally {
	chrome.kill();
	await wait(300);
	rmSync(profile, { recursive: true, force: true });
}
