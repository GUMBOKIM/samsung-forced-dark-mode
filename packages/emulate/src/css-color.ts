/** Finds and rewrites the colors inside computed CSS values. */
import { convert, type RGB, type Role } from './color.ts';

export interface ParsedColor {
	rgb: RGB;
	alpha: number;
}

/** Every color notation `getComputedStyle` can return */
const COLOR_TOKEN = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi;

function parseAlpha(text: string | undefined) {
	if (text === undefined) return 1;
	return text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text);
}

/** Parses `rgb()` and `rgba()` directly, in both the comma and the space notation */
export function parseRgb(token: string): ParsedColor | null {
	const match = /^rgba?\(([^)]+)\)$/i.exec(token.trim());
	if (!match?.[1]) return null;
	const [r, g, b, a] = match[1].split(/[\s,/]+/).filter(Boolean);
	const rgb = [r, g, b].map((part) => Math.round(Number(part)));
	if (rgb.some(Number.isNaN) || rgb.length !== 3) return null;
	return { rgb: rgb as unknown as RGB, alpha: parseAlpha(a) };
}

let painter: CanvasRenderingContext2D | null | undefined;

/** Resolves notations such as `oklch()` by painting them, since browsers keep them as written */
function parseByPainting(token: string): ParsedColor | null {
	if (typeof document === 'undefined') return null;
	if (painter === undefined) {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		painter = canvas.getContext('2d', { willReadFrequently: true });
	}
	if (!painter) return null;
	const alpha = /\/\s*([\d.]+%?)\s*\)$/.exec(token)?.[1];
	// Painted opaque, because reading back a translucent pixel loses channel precision.
	const opaque = token.replace(/\s*\/\s*[\d.]+%?\s*\)$/, ')');
	painter.clearRect(0, 0, 1, 1);
	painter.fillStyle = '#000000';
	painter.fillStyle = opaque;
	painter.fillRect(0, 0, 1, 1);
	const [r = 0, g = 0, b = 0] = painter.getImageData(0, 0, 1, 1).data;
	return { rgb: [r, g, b], alpha: parseAlpha(alpha) };
}

const cache = new Map<string, ParsedColor | null>();

export function parseColor(token: string) {
	let parsed = cache.get(token);
	if (parsed === undefined) {
		parsed = parseRgb(token) ?? parseByPainting(token);
		cache.set(token, parsed);
	}
	return parsed;
}

const format = ([r, g, b]: RGB, alpha: number) =>
	alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** Converts every visible color in a value, leaving fully transparent ones as they are */
export function rewriteColors(value: string, role: Role) {
	return value.replace(COLOR_TOKEN, (token) => {
		const parsed = parseColor(token);
		if (!parsed || parsed.alpha === 0) return token;
		return format(convert(parsed.rgb, role), parsed.alpha);
	});
}

/** True when the value holds a color that can actually be seen */
export function hasVisibleColor(value: string) {
	for (const token of value.match(COLOR_TOKEN) ?? []) {
		const parsed = parseColor(token);
		if (parsed && parsed.alpha > 0) return true;
	}
	return false;
}
