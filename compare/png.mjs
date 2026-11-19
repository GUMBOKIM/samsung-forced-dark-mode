// Decodes 8-bit, non-interlaced PNG files so pixels can be compared without a dependency.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(file) {
	const bytes = readFileSync(file);
	let offset = 8;
	let width = 0;
	let height = 0;
	let channels = 4;
	const chunks = [];
	while (offset < bytes.length) {
		const length = bytes.readUInt32BE(offset);
		const type = bytes.toString('latin1', offset + 4, offset + 8);
		const data = bytes.subarray(offset + 8, offset + 8 + length);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			channels = data[9] === 6 ? 4 : 3;
		}
		if (type === 'IDAT') chunks.push(data);
		offset += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(chunks));
	const stride = width * channels;
	const pixels = Buffer.alloc(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		for (let x = 0; x < stride; x++) {
			const value = raw[y * (stride + 1) + 1 + x];
			const a = x >= channels ? pixels[y * stride + x - channels] : 0;
			const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
			const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
			const p = a + b - c;
			const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
			const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			pixels[y * stride + x] = (value + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
		}
	}
	return {
		width,
		height,
		at(x, y) {
			const start = Math.round(y) * stride + Math.round(x) * channels;
			return [pixels[start], pixels[start + 1], pixels[start + 2]];
		},
	};
}
