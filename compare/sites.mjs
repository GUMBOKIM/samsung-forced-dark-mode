// Compares real websites on one phone: Samsung Internet's forced dark against the emulator running in Chrome.
// Same device, fonts and viewport on both sides. Every tab this opens is closed again.
// Usage: node compare/sites.mjs [name=url ...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
import { readPng } from './png.mjs';

const SITES = process.argv.length > 2
	? process.argv.slice(2).map((arg) => [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)])
	: [
			['fixture', 'http://localhost:5177/compare/page.html'],
			['naver', 'https://m.naver.com/'],
			['daum', 'https://m.daum.net/'],
			['namuwiki', 'https://namu.wiki/w/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD'],
			['youtube', 'https://m.youtube.com/'],
			['reddit', 'https://www.reddit.com/r/popular/'],
			['amazon', 'https://www.amazon.com/'],
			['bbc', 'https://www.bbc.com/news'],
			['cnn', 'https://edition.cnn.com/'],
			['nytimes', 'https://www.nytimes.com/'],
			['github', 'https://github.com/trending'],
			['stackoverflow', 'https://stackoverflow.com/questions'],
			['apple', 'https://www.apple.com/kr/'],
			['yes24', 'https://m.yes24.com/'],
			['musinsa', 'https://www.musinsa.com/main/musinsa/recommend'],
			['clien', 'https://m.clien.net/service/'],
		];

const SCROLLS = [0, 1200, 2400];
const SAMSUNG_PORT = 9433;
const CHROME_PORT = 9434;
const LOCAL_PORT = 5177;
const OUT = new URL('./out/sites/', import.meta.url);
const SCRIPT = readFileSync(new URL('../dist/emulate.global.js', import.meta.url), 'utf8');

const adb = (...args) => execFileSync('adb', args).toString();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = (port, path, init) => fetch(`http://127.0.0.1:${port}/json/${path}`, init);
const targets = async (port) => (await (await api(port, 'list')).json()).filter((target) => target.type === 'page');

function connect(url) {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		let id = 0;
		const waiting = new Map();
		socket.onerror = reject;
		socket.onmessage = ({ data }) => {
			const message = JSON.parse(data);
			waiting.get(message.id)?.(message.result ?? message);
			waiting.delete(message.id);
		};
		socket.onopen = () =>
			resolve({
				send: (method, params = {}, timeout = 30000) =>
					new Promise((done) => {
						const current = ++id;
						const timer = setTimeout(() => done({ timeout: method }), timeout);
						waiting.set(current, (result) => {
							clearTimeout(timer);
							done(result);
						});
						socket.send(JSON.stringify({ id: current, method, params }));
					}),
				close: () => socket.close(),
			});
	});
}

const evaluate = async (page, expression) => {
	const reply = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
	return reply.result?.value;
};
const shoot = async (page) => {
	const shot = await page.send('Page.captureScreenshot', { format: 'png' });
	if (!shot.data) throw new Error(`No screenshot: ${JSON.stringify(shot).slice(0, 160)}`);
	return Buffer.from(shot.data, 'base64');
};

/** What is on screen, so a shot where the two browsers show different content can be left out */
const FINGERPRINT = `(() => {
	const seen = [...document.images].map((el) => [el, el.getBoundingClientRect()]).filter(([, b]) => b.bottom > 0 && b.top < innerHeight && b.width > 40 && b.height > 40).map(([el, b]) => (el.currentSrc || el.src).slice(-60) + '@' + Math.round(b.left / 6) + ',' + Math.round(b.top / 6));
	const text = (document.body.innerText || '').replace(/\\s+/g, '');
	let hash = 0;
	for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
	return JSON.stringify({ hash, height: Math.round(document.documentElement.scrollHeight / 12), seen });
})()`;
const prints = new Map();

/** Finds the tab an intent just opened, and stops if it replaced a tab that was already open */
async function openedTab(port, before) {
	const now = await targets(port);
	for (const tab of before) {
		const same = now.find((item) => item.id === tab.id);
		if (same && same.url !== tab.url) throw new Error('An existing tab was navigated, stopping');
	}
	const created = now.filter((item) => !before.some((tab) => tab.id === item.id));
	if (created.length !== 1) throw new Error(`Expected one new tab, found ${created.length}`);
	return created[0];
}

/** Opens the site in Samsung Internet and returns what Chrome needs to load the same page */
async function captureSamsung(name, url) {
	const before = await targets(SAMSUNG_PORT);
	adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, '-n', 'com.sec.android.app.sbrowser/.SBrowserMainActivity');
	await wait(4000);
	const target = await openedTab(SAMSUNG_PORT, before);
	await api(SAMSUNG_PORT, `activate/${target.id}`);
	await wait(800);
	const page = await connect(target.webSocketDebuggerUrl);
	try {
		const meta = await evaluate(page, `({ ua: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, dark: matchMedia('(prefers-color-scheme: dark)').matches, scrollHeight: document.documentElement.scrollHeight })`);
		for (const y of SCROLLS) {
			await evaluate(page, `scrollTo(0, ${y})`);
			await wait(900);
			prints.set(`${name}-${y}`, await evaluate(page, FINGERPRINT));
			writeFileSync(new URL(`${name}-${y}.samsung.png`, OUT), await shoot(page));
		}
		return meta;
	} finally {
		page.close();
		await api(SAMSUNG_PORT, `close/${target.id}`);
	}
}

/** Loads the same page in Chrome with Samsung's user agent and viewport, then runs the emulator */
async function captureChrome(name, url, meta) {
	const before = await targets(CHROME_PORT);
	const blank = `http://localhost:${LOCAL_PORT}/compare/icons.html?blank=${Date.now()}`;
	adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${blank}'`, '--ez', 'create_new_tab', 'true', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main');
	await wait(1800);
	const target = await openedTab(CHROME_PORT, before);
	await api(CHROME_PORT, `activate/${target.id}`);
	await wait(800);
	const page = await connect(target.webSocketDebuggerUrl);
	try {
		await page.send('Page.enable');
		await page.send('Page.setBypassCSP', { enabled: true });
		await page.send('Emulation.setUserAgentOverride', { userAgent: meta.ua });
		await page.send('Emulation.setDeviceMetricsOverride', { width: meta.width, height: meta.height, deviceScaleFactor: meta.dpr, mobile: true });
		await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: meta.dark ? 'dark' : 'light' }] });
		await page.send('Page.navigate', { url });
		await wait(4000);
		const plain = {};
		for (const y of SCROLLS) {
			await evaluate(page, `scrollTo(0, ${y})`);
			await wait(350);
			plain[y] = await shoot(page);
		}
		await evaluate(page, `${SCRIPT};SamsungForcedDarkEmulate.emulateForcedDark();0`);
		await wait(2500);
		for (const y of SCROLLS) {
			await evaluate(page, `scrollTo(0, ${y})`);
			await wait(800);
			prints.set(`${name}-${y}`, prints.get(`${name}-${y}`) === (await evaluate(page, FINGERPRINT)));
			writeFileSync(new URL(`${name}-${y}.plain.png`, OUT), plain[y]);
			writeFileSync(new URL(`${name}-${y}.emulated.png`, OUT), await shoot(page));
		}
	} finally {
		page.close();
		await api(CHROME_PORT, `close/${target.id}`);
	}
}

/** Samsung Internet's screenshots are saved in Display P3, while Chrome's are sRGB */
const P3_TO_SRGB = [
	[1.2249, -0.2247, 0],
	[-0.042, 1.0419, 0],
	[-0.0197, -0.0786, 1.0979],
];
const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const converted = new Map();
const toSrgb = (rgb) => {
	const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
	let result = converted.get(key);
	if (!result) {
		const linear = [rgb[0], rgb[1], rgb[2]].map((v) => decode(v / 255));
		result = P3_TO_SRGB.map((row) => Math.round(255 * encode(Math.min(1, Math.max(0, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])))));
		converted.set(key, result);
	}
	return result;
};

const difference = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** Samsung's capture starts with blank space for the toolbar, so the page is located by content */
function findOffset(samsung, other, height) {
	let best = 0;
	let lowest = Infinity;
	for (let offset = 0; offset <= Math.min(420, samsung.height - height); offset++) {
		let cost = 0;
		for (let y = 0; y < height; y += 37) for (let x = 5; x < other.width; x += 43) cost += difference(toSrgb(samsung.at(x, y + offset)), other.at(x, y));
		if (cost < lowest) {
			lowest = cost;
			best = offset;
		}
	}
	return best;
}

function writePng(path, width, height, rgb) {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buffer) => {
		let c = 0xffffffff;
		for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type, data) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const sum = Buffer.alloc(4);
		sum.writeUInt32BE(crc(body));
		return Buffer.concat([length, body, sum]);
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

function compare(name, y) {
	const path = (kind) => new URL(`${name}-${y}.${kind}.png`, OUT).pathname;
	const samsung = readPng(path('samsung'));
	const emulated = readPng(path('emulated'));
	const plain = readPng(path('plain'));
	const height = Math.min(emulated.height, samsung.height - 1);
	const offset = findOffset(samsung, emulated, Math.min(height, samsung.height - 420));
	const rows = Math.min(height, samsung.height - offset);
	const width = Math.min(samsung.width, emulated.width);
	const tally = { emulated: { 5: 0, 10: 0, 20: 0 }, plain: { 5: 0, 10: 0, 20: 0 } };
	const step = 3;
	const panelWidth = Math.floor(width / step);
	const panelHeight = Math.floor(rows / step);
	const gap = 6;
	const sideWidth = panelWidth * 3 + gap * 2;
	const side = Buffer.alloc(sideWidth * panelHeight * 3, 90);
	let total = 0;
	for (let py = 0; py < rows; py++) {
		for (let px = 0; px < width; px++) {
			const real = toSrgb(samsung.at(px, py + offset));
			const mine = emulated.at(px, py);
			const error = difference(real, mine);
			const baseline = difference(real, plain.at(px, py));
			for (const limit of [5, 10, 20]) {
				if (error <= limit) tally.emulated[limit]++;
				if (baseline <= limit) tally.plain[limit]++;
			}
			total++;
			if (px % step === 0 && py % step === 0 && py / step < panelHeight && px / step < panelWidth) {
				const row = (py / step) * sideWidth * 3;
				const column = px / step;
				const put = (panel, color) => side.set(color.slice(0, 3), row + (column + panel * (panelWidth + gap)) * 3);
				put(0, real);
				put(1, mine);
				put(2, error > 20 ? [255, 60, 60] : error > 10 ? [255, 190, 60] : [mine[0] >> 2, mine[1] >> 2, mine[2] >> 2]);
			}
		}
	}
	writePng(path('side'), sideWidth, panelHeight, side);
	const percent = (value) => +((value / total) * 100).toFixed(2);
	return {
		offset,
		within5: percent(tally.emulated[5]),
		within10: percent(tally.emulated[10]),
		within20: percent(tally.emulated[20]),
		withoutEmulator10: percent(tally.plain[10]),
	};
}

if (!isMainThread) {
	parentPort.postMessage(compare(workerData.name, workerData.y));
	process.exit(0);
}

/** Pixel comparison runs beside the captures, so the phone never waits for it */
const MAX_WORKERS = Math.max(2, cpus().length - 2);
let running = 0;
const waitingJobs = [];
const pump = () => {
	while (running < MAX_WORKERS && waitingJobs.length > 0) {
		const { name, y, dark, done } = waitingJobs.shift();
		running++;
		const worker = new Worker(new URL(import.meta.url), { workerData: { name, y } });
		const finish = (result) => {
			running--;
			done({ name, scroll: y, dark, ...result });
			pump();
		};
		worker.once('message', finish);
		worker.once('error', (error) => finish({ error: String(error.message ?? error) }));
	}
};
const compareLater = (name, y, dark) =>
	new Promise((done) => {
		waitingJobs.push({ name, y, dark, done });
		pump();
	});

mkdirSync(OUT, { recursive: true });
adb('reverse', `tcp:${LOCAL_PORT}`, `tcp:${LOCAL_PORT}`);
adb('forward', `tcp:${SAMSUNG_PORT}`, 'localabstract:Terrace_devtools_remote');
adb('forward', `tcp:${CHROME_PORT}`, 'localabstract:chrome_devtools_remote');

const unlocked = () => adb('shell', 'dumpsys', 'window').includes('isKeyguardShowing=false');
// A locked phone stops painting, so every screenshot after that point would time out.
const keepAwake = setInterval(() => {
	try {
		adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
	} catch {}
}, 15000);

const results = [];
const pending = [];
try {
	for (const [name, url] of SITES) {
		if (!unlocked()) {
			console.log(JSON.stringify({ stopped: `phone locked before ${name}` }));
			break;
		}
		try {
			const meta = await captureSamsung(name, url);
			await captureChrome(name, url, meta);
			for (const y of SCROLLS) {
				pending.push(
					compareLater(name, y, meta.dark).then((outcome) => {
						const result = { ...outcome, sameContent: prints.get(`${name}-${y}`) === true };
						results.push(result);
						console.log(JSON.stringify(result));
					}),
				);
			}
		} catch (error) {
			results.push({ name, error: String(error.message ?? error) });
			console.log(JSON.stringify(results.at(-1)));
		}
	}
	await Promise.all(pending);
} finally {
	clearInterval(keepAwake);
	adb('reverse', '--remove', `tcp:${LOCAL_PORT}`);
	adb('forward', '--remove', `tcp:${SAMSUNG_PORT}`);
	adb('forward', '--remove', `tcp:${CHROME_PORT}`);
	writeFileSync(new URL('results.json', OUT), JSON.stringify(results, null, 1));
}
