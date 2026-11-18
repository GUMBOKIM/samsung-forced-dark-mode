/**
 * Samsung Internet's forced dark color conversion, with no DOM access.
 *
 * The luma shift was documented by Daniel Aleksandersen for Samsung Internet 11 (ctrl.blog, 2020).
 * The ranges below were re-measured with 256 gray levels on Samsung Internet 31.0.
 */

export type RGB = readonly [number, number, number];

export type Role =
	| 'root'
	| 'background'
	| 'button'
	| 'field'
	| 'gradient'
	| 'border'
	| 'outline'
	| 'shadow'
	| 'svg'
	| 'text'
	| 'image'
	| 'bgimage';

interface Range {
	min: number;
	max: number;
	invert: boolean;
}

export const RANGES: Record<Role, Range> = {
	root: { min: 0.004, max: 0.12, invert: false },
	background: { min: 0.004, max: 0.12, invert: false },
	button: { min: 0.15, max: 0.29, invert: false },
	field: { min: 0.067, max: 0.165, invert: false },
	gradient: { min: 0.02, max: 0.12, invert: false },
	border: { min: 0.27, max: 0.33, invert: false },
	outline: { min: 0.14, max: 0.2, invert: false },
	shadow: { min: 0.28, max: 0.33, invert: false },
	svg: { min: 0.5, max: 0.7, invert: false },
	text: { min: 0.29, max: 1, invert: true },
	image: { min: 0, max: 0.7, invert: false },
	bgimage: { min: 0, max: 0.5, invert: false },
};

/** Multipliers for bitmaps, which are dimmed as a whole */
export const IMAGE_BRIGHTNESS = RANGES.image.max;
export const BACKGROUND_IMAGE_BRIGHTNESS = RANGES.bgimage.max;

/** Text at or above this luma keeps its direction: gray 216 becomes 102, but 217 becomes 228 */
const TEXT_KEEP_LUMA = 0.85;

/** A box no larger than this in both directions is painted like text (CSS px) */
export const SMALL_BOX_PX = 20;

const to8 = (value: number) => Math.round(Math.min(255, Math.max(0, value)));

/** BT.601 luma, from 0 to 1 */
export const luma = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * Moves luma into the role's range and keeps Cb and Cr. In RGB that adds one offset to all three
 * channels, and the channels clipped at 0 are what turn yellow into brown.
 */
export function convert(rgb: RGB, role: Role): RGB {
	const { min, max, invert } = RANGES[role];
	if (role === 'image' || role === 'bgimage') {
		return [to8(rgb[0] * max), to8(rgb[1] * max), to8(rgb[2] * max)];
	}
	const y = luma(rgb);
	const flip = invert && y < TEXT_KEEP_LUMA;
	const delta = (min + (flip ? 1 - y : y) * (max - min) - y) * 255;
	return [to8(rgb[0] + delta), to8(rgb[1] + delta), to8(rgb[2] + delta)];
}
