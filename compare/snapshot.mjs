// Freezes real websites into static pages, so both phone browsers show exactly the same content.
// Ads, carousels and logins otherwise differ between two loads and swamp the color comparison.
// Pages are captured in a fresh desktop Chrome profile and written to compare/out/snapshots/.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITES = [
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
	['naver-news', 'https://news.naver.com/'],
	['tistory', 'https://www.tistory.com/'],
	['velog', 'https://velog.io/'],
	['brunch', 'https://brunch.co.kr/'],
	['ohou', 'https://ohou.se/'],
	['kurly', 'https://www.kurly.com/main'],
	['gmarket', 'https://m.gmarket.co.kr/'],
	['11st', 'https://m.11st.co.kr/'],
	['melon', 'https://m2.melon.com/'],
	['ruliweb', 'https://m.ruliweb.com/'],
	['inven', 'https://m.inven.co.kr/'],
	['chosun', 'https://www.chosun.com/'],
	['joongang', 'https://www.joongang.co.kr/'],
	['hani', 'https://www.hani.co.kr/'],
	['khan', 'https://www.khan.co.kr/'],
	['mk', 'https://www.mk.co.kr/'],
	['wikipedia', 'https://en.wikipedia.org/wiki/Seoul'],
	['wikipedia-ko', 'https://ko.wikipedia.org/wiki/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C'],
	['mdn', 'https://developer.mozilla.org/en-US/docs/Web/CSS/color'],
	['hacker-news', 'https://news.ycombinator.com/'],
	['geeknews', 'https://news.hada.io/'],
	['npm', 'https://www.npmjs.com/package/react'],
	['medium', 'https://medium.com/'],
	['theguardian', 'https://www.theguardian.com/international'],
	['washingtonpost', 'https://www.washingtonpost.com/'],
	['forbes', 'https://www.forbes.com/'],
	['techcrunch', 'https://techcrunch.com/'],
	['theverge', 'https://www.theverge.com/'],
	['espn', 'https://www.espn.com/'],
	['imdb', 'https://m.imdb.com/'],
	['ebay', 'https://www.ebay.com/'],
	['walmart', 'https://www.walmart.com/'],
	['etsy', 'https://www.etsy.com/'],
	['booking', 'https://www.booking.com/'],
	['tripadvisor', 'https://www.tripadvisor.com/'],
	['microsoft', 'https://www.microsoft.com/ko-kr/'],
	['samsung', 'https://www.samsung.com/sec/'],
	['netflix', 'https://www.netflix.com/kr/'],
	['spotify', 'https://open.spotify.com/'],
	['twitch', 'https://m.twitch.tv/'],
	['pinterest', 'https://www.pinterest.com/ideas/'],
];

// With --articles, each listed site's home page is only used to find one article to freeze.
const ARTICLES = process.argv.includes('--articles');
const ARTICLE_SITES = new Set(['naver-news', 'daum', 'bbc', 'cnn', 'nytimes', 'theguardian', 'washingtonpost', 'forbes', 'techcrunch', 'theverge', 'espn', 'chosun', 'joongang', 'hani', 'khan', 'mk', 'clien', 'ruliweb', 'inven', 'geeknews', 'stackoverflow', 'medium', 'velog', 'tistory', 'brunch', 'imdb', 'yes24', 'musinsa', 'gmarket', '11st', 'kurly', 'ohou', 'ebay', 'amazon', 'naver', 'youtube']);
const FIND_ARTICLE = `(() => {
	const site = location.host.replace(/^(www|m|edition|news)\\./, '');
	const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.href, text: (a.innerText || '').trim() })).filter(({ href, text }) => {
		try {
			const url = new URL(href);
			return url.protocol === 'https:' && url.host.endsWith(site) && text.length >= 10 && /\\d|-/.test(url.pathname) && url.pathname.length > 8;
		} catch { return false; }
	});
	links.sort((a, b) => b.text.length - a.text.length);
	return links[0]?.href ?? null;
})()`;

// With --full, every image, font and stylesheet the page loaded is copied next to the snapshot.
const FULL = process.argv.includes('--full');
const ASSETS = new URL('./out/snapshots/assets/', import.meta.url);
const LOCAL_ASSETS = 'http://localhost:5177/compare/out/snapshots/assets/';
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf', 'application/font-woff2': 'woff2', 'application/font-woff': 'woff', 'application/x-font-woff': 'woff', 'application/x-font-ttf': 'ttf', 'text/css': 'css' };
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

/** Copies what the page loaded and points the snapshot at the local copies */
async function localize(page, html) {
	const { frameTree } = await page.send('Page.getResourceTree');
	const frameId = frameTree.frame.id;
	const resources = frameTree.resources.filter((item) => /^https?:/.test(item.url) && EXTENSIONS[item.mimeType]);
	const local = new Map();
	const sheets = [];
	for (const item of resources) {
		const reply = await page.send('Page.getResourceContent', { frameId, url: item.url }, 15000);
		if (reply.content === undefined || reply.timeout) continue;
		const bytes = Buffer.from(reply.content, reply.base64Encoded ? 'base64' : 'utf8');
		if (bytes.length > MAX_ASSET_BYTES) continue;
		const file = `${createHash('sha1').update(item.url).digest('hex').slice(0, 20)}.${EXTENSIONS[item.mimeType]}`;
		local.set(item.url, LOCAL_ASSETS + file);
		if (item.mimeType === 'text/css') sheets.push([item.url, file, bytes.toString('utf8')]);
		else writeFileSync(new URL(file, ASSETS), bytes);
	}
	const swap = (text) => {
		for (const [url, copy] of [...local].sort((a, b) => b[0].length - a[0].length)) {
			text = text.split(url).join(copy).split(url.replaceAll('&', '&amp;')).join(copy);
		}
		return text;
	};
	for (const [url, file, css] of sheets) {
		const absolute = css.replace(/url\((["']?)(?!data:|#)([^"')]+)\1\)/g, (match, quote, path) => {
			try {
				return `url("${new URL(path, url).href}")`;
			} catch {
				return match;
			}
		});
		writeFileSync(new URL(file, ASSETS), swap(absolute));
	}
	return { html: swap(html), copied: local.size };
}

const PORT = 9555;
const CONCURRENCY = 8;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('./out/snapshots/', import.meta.url);
const { ua } = JSON.parse(readFileSync(new URL('./out/fixture-0.phone.json', import.meta.url), 'utf8'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FREEZE = `(async () => {
	const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	for (let y = 0; y < 5000; y += 500) { scrollTo(0, y); await pause(220); }
	scrollTo(0, 0);
	await pause(1200);

	const roots = [];
	const walk = (scope) => { for (const el of scope.querySelectorAll('*')) if (el.shadowRoot) { roots.push(el.shadowRoot); walk(el.shadowRoot); } };
	walk(document);
	const scopes = [document, ...roots];

	for (const scope of scopes) {
		for (const img of scope.querySelectorAll('img')) {
			if (img.currentSrc) img.setAttribute('src', img.currentSrc);
			for (const name of ['srcset', 'sizes', 'loading', 'decoding']) img.removeAttribute(name);
		}
		for (const source of scope.querySelectorAll('picture source')) source.remove();
		for (const sheet of scope.styleSheets) {
			try {
				const text = [...sheet.cssRules].map((rule) => rule.cssText).join('\\n');
				if (sheet.ownerNode?.tagName === 'STYLE') sheet.ownerNode.textContent = text;
				else if (sheet.ownerNode?.tagName === 'LINK') {
					const style = document.createElement('style');
					style.textContent = text.replace(/url\\((["']?)(?!data:|https?:|#)([^"')]+)\\1\\)/g, (_, q, path) => 'url("' + new URL(path, sheet.href).href + '")');
					if (sheet.media.mediaText) style.media = sheet.media.mediaText;
					sheet.ownerNode.replaceWith(style);
				}
			} catch {}
		}
		for (const sheet of scope.adoptedStyleSheets ?? []) {
			const style = document.createElement('style');
			style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\\n');
			(scope === document ? document.head : scope).append(style);
		}
		for (const el of scope.querySelectorAll('iframe, video, embed, object, canvas')) {
			const box = el.getBoundingClientRect();
			const css = getComputedStyle(el);
			const stand = document.createElement('div');
			stand.style.cssText = 'display:' + (css.display === 'inline' ? 'inline-block' : css.display) + ';position:' + css.position + ';left:' + css.left + ';top:' + css.top + ';width:' + box.width + 'px;height:' + box.height + 'px';
			el.replaceWith(stand);
		}
		for (const el of scope.querySelectorAll('script, noscript, link[rel=preload], link[rel=prefetch], link[rel=modulepreload], meta[http-equiv]')) el.remove();
		for (const el of scope.querySelectorAll('*')) for (const { name } of [...el.attributes]) if (/^on/i.test(name)) el.removeAttribute(name);
	}

	const head = document.head;
	const base = document.createElement('base');
	base.href = location.href;
	head.prepend(base);
	const referrer = document.createElement('meta');
	referrer.name = 'referrer';
	referrer.content = 'no-referrer';
	head.prepend(referrer);
	const still = document.createElement('style');
	still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-snap-type:none!important;scroll-behavior:auto!important}';
	head.append(still);

	const html = document.documentElement;
	const attributes = [...html.attributes].map(({ name, value }) => ' ' + name + '="' + value.replace(/"/g, '&quot;') + '"').join('');
	return '<!doctype html><html' + attributes + '>' + html.getHTML({ shadowRoots: roots }) + '</html>';
})()`;

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
				send: (method, params = {}, timeout = 60000) =>
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

mkdirSync(ASSETS, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'sfd-snapshot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--window-size=360,601', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'], { stdio: 'ignore' });

try {
	await wait(2500);
	const outName = (name) => `${FULL ? 'full-' : ''}${ARTICLES ? 'article-' : ''}${name}`;
	const queue = SITES.filter(([name]) => (!ARTICLES || ARTICLE_SITES.has(name)) && !existsSync(new URL(`${outName(name)}.html`, OUT)));
	const worker = async () => {
		for (let next = queue.shift(); next; next = queue.shift()) {
			const [name, url] = next;
			const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
			const page = await connect(target.webSocketDebuggerUrl);
			try {
				await page.send('Page.enable');
				await page.send('Page.setBypassCSP', { enabled: true });
				await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
				await page.send('Emulation.setUserAgentOverride', { userAgent: ua });
				await page.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 601, deviceScaleFactor: 3, mobile: true });
				await page.send('Page.navigate', { url });
				await wait(ARTICLES ? 6000 : 8000);
				if (ARTICLES) {
					const article = (await page.send('Runtime.evaluate', { expression: FIND_ARTICLE, returnByValue: true }, 15000)).result?.value;
					if (!article) throw new Error('no article link found');
					await page.send('Page.navigate', { url: article });
					await wait(7000);
				}
				const reply = await page.send('Runtime.evaluate', { expression: FREEZE, awaitPromise: true, returnByValue: true }, 45000);
				let html = reply.result?.value;
				if (!html) throw new Error(reply.exceptionDetails?.exception?.description ?? JSON.stringify(reply).slice(0, 200));
				let copied = 0;
				if (FULL) ({ html, copied } = await localize(page, html));
				writeFileSync(new URL(`${outName(name)}.html`, OUT), html);
				console.log(outName(name), `${Math.round(html.length / 1024)} KB`, `${copied} files copied`);
			} catch (error) {
				console.log(name, 'FAILED', String(error.message ?? error).slice(0, 160));
			} finally {
				page.close();
				await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
			}
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
} finally {
	chrome.kill();
	await wait(500);
	rmSync(profile, { recursive: true, force: true });
}
