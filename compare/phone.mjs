// Captures the comparison pages from Samsung Internet on a phone connected over adb.
// The phone must be unlocked, with forced dark on. Each tab this opens is closed again.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 5177;
const DEVTOOLS = 9433;
const OUT = new URL('./out/', import.meta.url);
// Pass name=path arguments to capture other pages instead of the default set.
const requested = process.argv.slice(2).map((arg) => [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]);
const PAGES = requested.length > 0 ? requested : [
	['fixture-0', '/compare/fixture.html?page=0'],
	['fixture-1', '/compare/fixture.html?page=1'],
	['page', '/compare/page.html'],
];

const adb = (...args) => execFileSync('adb', args).toString();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = (path) => fetch(`http://127.0.0.1:${DEVTOOLS}/json/${path}`);
const targets = async () => (await (await api('list')).json()).filter((target) => target.type === 'page');

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
				send: (method, params = {}, timeout = 20000) =>
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

mkdirSync(OUT, { recursive: true });
adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
adb('forward', `tcp:${DEVTOOLS}`, 'localabstract:Terrace_devtools_remote');

for (const [name, path] of PAGES) {
	const url = `http://localhost:${PORT}${path}${path.includes('?') ? '&' : '?'}run=${Date.now()}`;
	// adb joins its arguments into one device shell command, so the & in the URL has to be quoted.
	adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, '-n', 'com.sec.android.app.sbrowser/.SBrowserMainActivity');
	await wait(4500);
	const target = (await targets()).find((item) => item.url === url);
	if (!target) throw new Error(`Tab not found for ${name}`);
	await api(`activate/${target.id}`);
	await wait(2500);
	const page = await connect(target.webSocketDebuggerUrl);
	const evaluate = async (expression) => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
	await evaluate('scrollTo(0, 0)');
	await wait(800);
	const meta = await evaluate('({ ready: !!window.__ready, dpr: devicePixelRatio, width: innerWidth, height: innerHeight, ua: navigator.userAgent, cells: window.__cells ?? [] })');
	const shot = await page.send('Page.captureScreenshot', { format: 'png' });
	page.close();
	await api(`close/${target.id}`);
	if (!shot.data) throw new Error(`No screenshot for ${name}: ${JSON.stringify(shot).slice(0, 160)}`);
	writeFileSync(new URL(`${name}.phone.png`, OUT), Buffer.from(shot.data, 'base64'));
	writeFileSync(new URL(`${name}.phone.json`, OUT), JSON.stringify(meta));
	console.log(name, `${meta.width}x${meta.height}`, `dpr ${meta.dpr}`, `ready ${meta.ready}`, `${meta.cells.length} cells`);
	await wait(800);
}

adb('reverse', '--remove', `tcp:${PORT}`);
adb('forward', '--remove', `tcp:${DEVTOOLS}`);
