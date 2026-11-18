/**
 * Detects Samsung Internet's forced dark mode.
 *
 * The page is never told about forced dark: `prefers-color-scheme` says light and
 * `getComputedStyle` returns the original colors. One signal does leak. A white SVG image drawn
 * into a canvas reads back dimmed (179 on Samsung Internet 31.0) instead of 255.
 */

export type ForcedDarkState = 'forced' | 'not-forced' | 'not-samsung' | 'unknown';

export interface Detection {
	state: ForcedDarkState;
	/** True only when forced dark was positively observed */
	forced: boolean;
	samsungBrowser: boolean;
	/** Samsung Internet version from the user agent, such as "31.0" */
	version: string | null;
	/** Red channel read back from the white SVG, or null when it was not read */
	sample: number | null;
}

export interface DetectOptions {
	/** A sample below this counts as forced dark. Defaults to 250. */
	threshold?: number;
	/** How long to wait for the probe image, in milliseconds. Defaults to 2000. */
	timeoutMs?: number;
	/** Overrides `navigator.userAgent` */
	userAgent?: string;
}

export const DEFAULT_THRESHOLD = 250;
const DEFAULT_TIMEOUT_MS = 2000;

const WHITE_SVG =
	'data:image/svg+xml,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#fff"/></svg>',
	);

export function samsungVersion(userAgent: string) {
	return /SamsungBrowser\/([\d.]+)/i.exec(userAgent)?.[1] ?? null;
}

export function classify(
	userAgent: string,
	sample: number | null,
	threshold: number = DEFAULT_THRESHOLD,
): Detection {
	const version = samsungVersion(userAgent);
	const samsungBrowser = /SamsungBrowser/i.test(userAgent);
	const state: ForcedDarkState = !samsungBrowser
		? 'not-samsung'
		: sample === null
			? 'unknown'
			: sample < threshold
				? 'forced'
				: 'not-forced';
	return { state, forced: state === 'forced', samsungBrowser, version, sample };
}

/** Draws the white SVG into a canvas and returns its red channel, or null if that fails */
export function readWhiteSvg(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
	return new Promise<number | null>((resolve) => {
		const image = new Image();
		const timer = setTimeout(() => resolve(null), timeoutMs);
		image.onload = () => {
			clearTimeout(timer);
			try {
				const canvas = document.createElement('canvas');
				canvas.width = canvas.height = 1;
				const context = canvas.getContext('2d');
				if (!context) return resolve(null);
				context.drawImage(image, 0, 0, 1, 1);
				resolve(context.getImageData(0, 0, 1, 1).data[0] ?? null);
			} catch {
				resolve(null);
			}
		};
		image.onerror = () => {
			clearTimeout(timer);
			resolve(null);
		};
		image.src = WHITE_SVG;
	});
}

export async function detectForcedDark(options: DetectOptions = {}): Promise<Detection> {
	const { threshold = DEFAULT_THRESHOLD, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
	const userAgent = options.userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
	// Other browsers cannot be in this mode, so they skip the canvas read entirely.
	if (!/SamsungBrowser/i.test(userAgent) || typeof document === 'undefined') {
		return classify(userAgent, null, threshold);
	}
	return classify(userAgent, await readWhiteSvg(timeoutMs), threshold);
}
