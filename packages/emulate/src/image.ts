/**
 * Decides how an image is repainted. Samsung Internet recolors the shapes inside an SVG image and
 * brightens small transparent dark bitmaps, so both have to be read before they can be converted.
 */
import { BACKGROUND_IMAGE_BRIGHTNESS, ICON_MAX_COVERAGE, ICON_MAX_PX, ICON_OFFSET, RANGES, isDarkIconColor, shapeRole } from './color.ts';
import { hasVisibleColor, rewriteColors } from './css-color.ts';

export type ImagePlan =
	/** An SVG with its shapes converted, as a data URL */
	| { kind: 'svg'; url: string }
	/** An SVG that could not be read, so it is converted as a whole by a filter */
	| { kind: 'unreadable-svg' }
	/** A dark icon, with `url` holding the brightened bitmap */
	| { kind: 'icon'; url: string }
	/** A background bitmap with see-through parts, with `url` holding the dimmed copy */
	| { kind: 'transparent'; url: string }
	/** A bitmap whose pixels are off limits, usually cross-origin without CORS */
	| { kind: 'unreadable' }
	| { kind: 'plain' };

/** The part of a background image an element shows, in the image's own pixels */
interface Crop {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Bitmap {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
	shifted?: string;
	dimmed?: string | null;
}

/** Fetches an image without the page's CORS limits, as a browser extension can */
export type ResourceLoader = (url: string) => Promise<Blob | null>;

export const SVG_FILTER = 'sfd-svg-image';
export const ICON_FILTER = 'sfd-dark-icon';

/** Whole `<img>` files larger than this are photos, and are never icons */
const MAX_ICON_FILE_PX = 512;
/** Larger bitmaps are not copied, since a page rarely uses one that big with transparency */
const MAX_COPIED_PX = 2048;
const MAX_READ_PX = 4096;
/** Nearly invisible edge pixels carry unreliable color */
const MIN_ALPHA = 16;

const svgMatrix = () => {
	const { min, max } = RANGES.svg;
	const k = max - min - 1;
	const row = (own: number) => [0.299, 0.587, 0.114].map((weight, i) => +(k * weight + (i === own ? 1 : 0)).toFixed(4)).join(' ');
	return `${row(0)} 0 ${min} ${row(1)} 0 ${min} ${row(2)} 0 ${min} 0 0 0 1 0`;
};
const offset = +(ICON_OFFSET / 255).toFixed(4);

/** Filters are looked up per tree, so each shadow root gets its own copy */
export const FILTER_MARKUP =
	'<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">' +
	`<filter id="${SVG_FILTER}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${svgMatrix()}"/></filter>` +
	`<filter id="${ICON_FILTER}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 ${offset} 0 1 0 0 ${offset} 0 0 1 0 ${offset} 0 0 0 1 0"/></filter>` +
	'</svg>';

const isSvgUrl = (url: string) => /^data:image\/svg\+xml/i.test(url) || /\.svg(?:[?#]|$)/i.test(url);

async function readSvgText(url: string, loader?: ResourceLoader): Promise<string | null> {
	try {
		const data = /^data:image\/svg\+xml([^,]*),(.*)$/is.exec(url);
		if (data) return /;base64/i.test(data[1]!) ? new TextDecoder().decode(Uint8Array.from(atob(data[2]!), (c) => c.charCodeAt(0))) : decodeURIComponent(data[2]!);
		if (loader) return (await (await loader(url))?.text()) ?? null;
		const response = await fetch(url);
		return response.ok ? await response.text() : null;
	} catch {
		return null;
	}
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text']);

/** Lays the SVG out at its displayed size, because the conversion depends on each shape's painted size */
function convertSvg(text: string, width: number, height: number): string | null {
	const parsed = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
	if (parsed.tagName !== 'svg') return null;
	// An SVG used as an image never runs scripts, so nothing that could run may reach the live page.
	for (const el of [parsed, ...parsed.querySelectorAll('*')]) {
		if (el.tagName === 'script' || el.tagName === 'foreignObject') el.remove();
		else for (const { name } of [...el.attributes]) if (/^on/i.test(name)) el.removeAttribute(name);
	}
	const svg = document.importNode(parsed, true) as unknown as SVGSVGElement;
	const originalWidth = parseFloat(svg.getAttribute('width') ?? '');
	const originalHeight = parseFloat(svg.getAttribute('height') ?? '');
	if (!svg.hasAttribute('viewBox') && originalWidth > 0 && originalHeight > 0) svg.setAttribute('viewBox', `0 0 ${originalWidth} ${originalHeight}`);
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));

	// A shadow root keeps the page's styles out and the SVG's own styles in.
	const host = document.createElement('div');
	host.style.cssText = 'all:initial;position:fixed;left:-99999px;top:0;visibility:hidden';
	host.attachShadow({ mode: 'open' }).append(svg);
	document.documentElement.append(host);
	try {
		for (const el of svg.querySelectorAll<SVGElement>('*')) {
			// Masks and clip paths are read as coverage, so recoloring them would change what shows through.
			if (el.closest('mask, clipPath')) continue;
			const css = getComputedStyle(el);
			if (el.tagName === 'stop') {
				el.style.setProperty('stop-color', rewriteColors(css.getPropertyValue('stop-color'), 'svg'));
			} else if (SHAPES.has(el.tagName)) {
				const box = el.getBoundingClientRect();
				const role = shapeRole(el.tagName, box.width, box.height);
				const fill = css.fill;
				const stroke = css.stroke;
				if (hasVisibleColor(fill)) el.style.setProperty('fill', rewriteColors(fill, role));
				if (hasVisibleColor(stroke)) el.style.setProperty('stroke', rewriteColors(stroke, role));
			}
		}
		return `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
	} finally {
		host.remove();
	}
}

async function loadBitmap(url: string, loader?: ResourceLoader): Promise<Bitmap | null> {
	let objectUrl: string | undefined;
	try {
		const image = new Image();
		const local = /^(data|blob):/i.test(url);
		if (loader && !local) {
			const blob = await loader(url);
			if (!blob) return null;
			image.src = objectUrl = URL.createObjectURL(blob);
		} else {
			if (!local) image.crossOrigin = 'anonymous';
			image.src = url;
		}
		await image.decode();
		const { naturalWidth: width, naturalHeight: height } = image;
		if (!width || !height || width > MAX_READ_PX || height > MAX_READ_PX) return null;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		ctx.drawImage(image, 0, 0);
		// Reading one pixel is what fails on a cross-origin image.
		ctx.getImageData(0, 0, 1, 1);
		return { ctx, canvas, width, height };
	} catch {
		return null;
	} finally {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	}
}

/** Whether this part of the bitmap is a dark shape on a mostly transparent background */
function isDarkIcon({ ctx }: Bitmap, crop: Crop): boolean {
	if (crop.width < 1 || crop.height < 1) return false;
	const { data } = ctx.getImageData(crop.x, crop.y, crop.width, crop.height);
	let visible = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] === 0) continue;
		visible++;
		if (data[i + 3]! >= MIN_ALPHA && !isDarkIconColor([data[i]!, data[i + 1]!, data[i + 2]!])) return false;
	}
	return visible > 0 && visible / (crop.width * crop.height) <= ICON_MAX_COVERAGE;
}

function repaint(bitmap: Bitmap, change: (value: number) => number): string {
	const copy = document.createElement('canvas');
	copy.width = bitmap.width;
	copy.height = bitmap.height;
	const ctx = copy.getContext('2d')!;
	const pixels = bitmap.ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	const { data } = pixels;
	for (let i = 0; i < data.length; i += 4) for (let channel = 0; channel < 3; channel++) data[i + channel] = change(data[i + channel]!);
	ctx.putImageData(pixels, 0, 0);
	return copy.toDataURL('image/png');
}

const shiftedUrl = (bitmap: Bitmap) => (bitmap.shifted ??= repaint(bitmap, (value) => Math.min(255, value + ICON_OFFSET)));

/** A dimmed copy for bitmaps with see-through parts, or null when a veil over the whole box looks the same */
function dimmedUrl(bitmap: Bitmap): string | null {
	if (bitmap.dimmed !== undefined) return bitmap.dimmed;
	bitmap.dimmed = null;
	if (bitmap.width > MAX_COPIED_PX || bitmap.height > MAX_COPIED_PX) return null;
	const { data } = bitmap.ctx.getImageData(0, 0, bitmap.width, bitmap.height);
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] !== 255) return (bitmap.dimmed = repaint(bitmap, (value) => Math.round(value * BACKGROUND_IMAGE_BRIGHTNESS)));
	}
	return null;
}

const axisScale = (value: string | undefined, boxLength: number, natural: number) => {
	if (!value || value === 'auto') return undefined;
	const number = parseFloat(value);
	return (value.endsWith('%') ? (boxLength * number) / 100 : number) / natural;
};

/** Works out which part of the image the element shows, from its computed background styles */
function tileCrop(bitmap: Bitmap, boxWidth: number, boxHeight: number, size: string, position: string): Crop {
	const { width, height } = bitmap;
	let scaleX = 1;
	let scaleY = 1;
	if (size === 'cover' || size === 'contain') {
		const pick = size === 'cover' ? Math.max : Math.min;
		scaleX = scaleY = pick(boxWidth / width, boxHeight / height);
	} else {
		const [first, second] = size.split(' ');
		const x = axisScale(first, boxWidth, width);
		const y = axisScale(second, boxHeight, height);
		scaleX = x ?? y ?? 1;
		scaleY = y ?? x ?? 1;
	}
	const place = (value: string | undefined, box: number, image: number) => {
		if (!value) return 0;
		const number = parseFloat(value);
		return value.endsWith('%') ? ((box - image) * number) / 100 : number;
	};
	const [left, top] = position.split(' ');
	const x = Math.max(0, Math.round(-place(left, boxWidth, width * scaleX) / scaleX));
	const y = Math.max(0, Math.round(-place(top, boxHeight, height * scaleY) / scaleY));
	return {
		x,
		y,
		width: Math.min(width - x, Math.round(boxWidth / scaleX)),
		height: Math.min(height - y, Math.round(boxHeight / scaleY)),
	};
}

/** Answers from a cache and calls `onReady` once an image that was still loading has been read */
export function createImageResolver(onReady: () => void, loader?: ResourceLoader) {
	const plans = new Map<string, ImagePlan | null>();
	const bitmaps = new Map<string, Promise<Bitmap | null>>();

	const bitmapFor = (url: string) => {
		let bitmap = bitmaps.get(url);
		if (!bitmap) bitmaps.set(url, (bitmap = loadBitmap(url, loader)));
		return bitmap;
	};

	const resolve = (key: string, work: () => Promise<ImagePlan>) => {
		if (!plans.has(key)) {
			plans.set(key, null);
			void work().then((plan) => {
				plans.set(key, plan);
				if (plan.kind !== 'plain') onReady();
			});
		}
		return plans.get(key) ?? undefined;
	};

	const svgPlan = (url: string, width: number, height: number) =>
		resolve(`svg|${url}|${Math.round(width)}|${Math.round(height)}`, async () => {
			const text = await readSvgText(url, loader);
			const converted = text ? convertSvg(text, width, height) : null;
			return converted ? { kind: 'svg', url: converted } : { kind: 'unreadable-svg' };
		});

	return {
		/** The plan for an `<img>`. Returns undefined until the image has been read. */
		lookup(url: string, width: number, height: number): ImagePlan | undefined {
			if (!url) return { kind: 'plain' };
			if (isSvgUrl(url)) return svgPlan(url, width, height);
			return resolve(`img|${url}`, async () => {
				const bitmap = await bitmapFor(url);
				if (!bitmap) return { kind: 'unreadable' };
				if (bitmap.width > MAX_ICON_FILE_PX || bitmap.height > MAX_ICON_FILE_PX) return { kind: 'plain' };
				const whole = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
				return isDarkIcon(bitmap, whole) ? { kind: 'icon', url: shiftedUrl(bitmap) } : { kind: 'plain' };
			});
		},

		/** The plan for a CSS background image, which may show only one tile of a sprite sheet */
		lookupBackground(url: string, width: number, height: number, size: string, position: string): ImagePlan | undefined {
			if (isSvgUrl(url)) return svgPlan(url, width, height);
			return resolve(`bg|${url}|${Math.round(width)}|${Math.round(height)}|${size}|${position}`, async () => {
				const bitmap = await bitmapFor(url);
				if (!bitmap) return { kind: 'unreadable' };
				if (width <= ICON_MAX_PX && height <= ICON_MAX_PX && isDarkIcon(bitmap, tileCrop(bitmap, width, height, size, position))) {
					return { kind: 'icon', url: shiftedUrl(bitmap) };
				}
				const dimmed = dimmedUrl(bitmap);
				return dimmed ? { kind: 'transparent', url: dimmed } : { kind: 'plain' };
			});
		},
	};
}
