// Serves the demo and the built scripts on the local machine.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.env.PORT ?? 5177);
const ROOT = resolve('.');
const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.avif': 'image/avif',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
};

createServer((request, response) => {
	const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
	const relative = path === '/' ? 'demo/index.html' : normalize(path).replace(/^[/\\]+/, '');
	const file = join(ROOT, relative);
	if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
		response.writeHead(404).end('Not found');
		return;
	}
	response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
	createReadStream(file).pipe(response);
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}`));
