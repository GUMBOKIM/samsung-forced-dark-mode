/**
 * Repaints a live page the way Samsung Internet's forced dark mode would.
 *
 * Samsung converts colors at paint time, which a page cannot reach. This reads every element's
 * computed colors, assigns the role the browser would paint them under, and writes the converted
 * colors back as inline styles.
 */
import {
	BACKGROUND_IMAGE_BRIGHTNESS,
	IMAGE_BRIGHTNESS,
	SMALL_BOX_PX,
	convert,
	type Role,
} from './color.ts';
import { hasVisibleColor, rewriteColors } from './css-color.ts';

export { convert, luma, type RGB, type Role } from './color.ts';
export { rewriteColors } from './css-color.ts';

export interface EmulateOptions {
	/** The subtree to convert. Defaults to the whole document. */
	root?: Element;
	/** Converts content added or changed later. Defaults to true. */
	observe?: boolean;
	/** The shortest time between two conversions while the page keeps changing, in milliseconds */
	minIntervalMs?: number;
}

export interface Emulation {
	readonly active: boolean;
	/** Converts the page again right away */
	refresh(): void;
	/** Puts every style back the way the page had it */
	stop(): void;
}

type Styled = HTMLElement | SVGElement;

interface SavedProp {
	value: string;
	priority: string;
	written: string;
}

interface Saved {
	hadStyle: boolean;
	props: Map<string, SavedProp>;
}

interface Write {
	el: Styled;
	prop: string;
	value: string;
}

/** Add this attribute to an element to leave it and its descendants unconverted */
export const IGNORE_ATTRIBUTE = 'data-sfd-ignore';

const BEFORE = 'data-sfd-before';
const AFTER = 'data-sfd-after';
const PLACEHOLDER = 'data-sfd-placeholder';
const MARKS = [BEFORE, AFTER, PLACEHOLDER];

const SKIPPED_TAGS = new Set(['HEAD', 'STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'BASE', 'NOSCRIPT', 'TEMPLATE']);
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const OBSERVED_ATTRIBUTES = ['class', 'style', 'hidden', 'open', 'disabled', 'checked', 'src'];
const DEFAULT_MIN_INTERVAL_MS = 200;

const pseudoRule = (attribute: string, pseudo: string, name: string) =>
	`[${attribute}]${pseudo}{color:var(--sfd-${name}-color)!important;background-color:var(--sfd-${name}-bg)!important;` +
	SIDES.map((side) => `border-${side}-color:var(--sfd-${name}-${side})!important`).join(';') +
	'}';

/** Pseudo-elements cannot take inline styles, so their colors travel through custom properties */
const PSEUDO_CSS =
	pseudoRule(BEFORE, '::before', 'before') +
	pseudoRule(AFTER, '::after', 'after') +
	`[${PLACEHOLDER}]::placeholder{color:var(--sfd-placeholder)!important;opacity:1!important}`;

/** Stops transitions while reading, or a computed color could be a value halfway through one */
const FREEZE_CSS = '*,*::before,*::after{transition:none!important}';

function backgroundRole(el: Element, box: DOMRect): Role {
	if (el === document.documentElement) return 'root';
	if (el.tagName === 'BUTTON' || el.tagName === 'SELECT') return 'button';
	if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return 'field';
	return box.width <= SMALL_BOX_PX && box.height <= SMALL_BOX_PX ? 'text' : 'background';
}

/** Dims a bitmap background by laying translucent black over it, since CSS cannot filter it alone */
function planBackgroundImage(css: CSSStyleDeclaration, add: (prop: string, value: string) => void) {
	const veil = `rgba(0, 0, 0, ${1 - BACKGROUND_IMAGE_BRIGHTNESS})`;
	add('background-image', `linear-gradient(${veil}, ${veil}), ${css.backgroundImage}`);
	// Adding a layer shifts the lists that pair with it, so each list gets a matching first entry.
	add('background-size', `auto, ${css.backgroundSize}`);
	add('background-position', `0% 0%, ${css.backgroundPosition}`);
	add('background-repeat', `repeat, ${css.backgroundRepeat}`);
	add('background-attachment', `scroll, ${css.backgroundAttachment}`);
	add('background-origin', `padding-box, ${css.backgroundOrigin}`);
	add('background-clip', `border-box, ${css.backgroundClip}`);
}

let current: Emulation | null = null;

/** Starts converting the page. Calling it again while running returns the running emulation. */
export function emulateForcedDark(options: EmulateOptions = {}): Emulation {
	if (current?.active) return current;

	const root = options.root ?? document.documentElement;
	const observe = options.observe ?? true;
	const minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

	const saved = new Map<Styled, Saved>();
	const marked = new Set<Element>();
	const sheets = new Map<ShadowRoot | Document, HTMLStyleElement>();
	let active = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastRun = 0;
	let lastCost = 0;

	const addSheet = (scope: ShadowRoot | Document) => {
		if (sheets.has(scope)) return;
		const sheet = document.createElement('style');
		sheet.setAttribute('data-sfd-style', '');
		sheet.textContent = PSEUDO_CSS;
		(scope instanceof Document ? scope.head ?? scope.documentElement : scope).append(sheet);
		sheets.set(scope, sheet);
	};

	const restore = () => {
		for (const [el, entry] of saved) {
			for (const [prop, { value, priority, written }] of entry.props) {
				// A different value means the page changed this property since, so the page wins.
				if (el.style.getPropertyValue(prop) !== written) continue;
				if (value) el.style.setProperty(prop, value, priority);
				else el.style.removeProperty(prop);
			}
			if (!entry.hadStyle && el.style.length === 0) {
				// Reading first makes the browser serialize pending style changes, or it re-adds an empty attribute.
				el.getAttribute('style');
				el.removeAttribute('style');
			}
		}
		saved.clear();
		for (const el of marked) for (const mark of MARKS) el.removeAttribute(mark);
		marked.clear();
	};

	const write = ({ el, prop, value }: Write) => {
		let entry = saved.get(el);
		if (!entry) {
			entry = { hadStyle: el.hasAttribute('style'), props: new Map() };
			saved.set(el, entry);
		}
		const before = { value: el.style.getPropertyValue(prop), priority: el.style.getPropertyPriority(prop) };
		el.style.setProperty(prop, value, 'important');
		entry.props.set(prop, { ...before, written: el.style.getPropertyValue(prop) });
	};

	/** Reads one element and lists its writes. Nothing is written until every element has been read. */
	const planElement = (el: Styled, writes: Write[], marks: [Element, string][]) => {
		const css = getComputedStyle(el);
		const add = (prop: string, value: string) => writes.push({ el, prop, value });
		const addConverted = (prop: string, value: string, role: Role) => {
			if (hasVisibleColor(value)) add(prop, rewriteColors(value, role));
		};

		if (el instanceof SVGElement) {
			if (el.tagName === 'stop') addConverted('stop-color', css.getPropertyValue('stop-color'), 'svg');
			if (el.tagName !== 'svg') {
				addConverted('fill', css.fill, 'svg');
				addConverted('stroke', css.stroke, 'svg');
			}
			return;
		}

		const box = el.getBoundingClientRect();
		addConverted('color', css.color, 'text');
		addConverted('-webkit-text-fill-color', css.getPropertyValue('-webkit-text-fill-color'), 'text');
		addConverted('caret-color', css.caretColor, 'text');
		addConverted('text-decoration-color', css.textDecorationColor, 'text');
		addConverted('background-color', css.backgroundColor, backgroundRole(el, box));

		if (css.backgroundImage.includes('url(')) planBackgroundImage(css, add);
		else if (css.backgroundImage.includes('gradient')) addConverted('background-image', css.backgroundImage, 'gradient');

		for (const side of SIDES) {
			if (parseFloat(css.getPropertyValue(`border-${side}-width`)) > 0) {
				addConverted(`border-${side}-color`, css.getPropertyValue(`border-${side}-color`), 'border');
			}
		}
		if (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0) addConverted('outline-color', css.outlineColor, 'outline');
		if (css.boxShadow !== 'none') addConverted('box-shadow', css.boxShadow, 'shadow');

		if (el.tagName === 'IMG') {
			const dim = `brightness(${IMAGE_BRIGHTNESS})`;
			add('filter', css.filter === 'none' ? dim : `${css.filter} ${dim}`);
		}

		if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
			add('--sfd-placeholder', rewriteColors(getComputedStyle(el, '::placeholder').color, 'text'));
			marks.push([el, PLACEHOLDER]);
		}

		for (const [pseudo, mark, name] of [['::before', BEFORE, 'before'], ['::after', AFTER, 'after']] as const) {
			const part = getComputedStyle(el, pseudo);
			if (part.content === 'none' || part.content === 'normal') continue;
			const small = parseFloat(part.width) <= SMALL_BOX_PX && parseFloat(part.height) <= SMALL_BOX_PX;
			add(`--sfd-${name}-color`, rewriteColors(part.color, 'text'));
			add(`--sfd-${name}-bg`, rewriteColors(part.backgroundColor, small ? 'text' : 'background'));
			for (const side of SIDES) {
				add(`--sfd-${name}-${side}`, rewriteColors(part.getPropertyValue(`border-${side}-color`), 'border'));
			}
			marks.push([el, mark]);
		}
	};

	const plan = () => {
		const writes: Write[] = [];
		const marks: [Element, string][] = [];
		const stack: Element[] = [root];
		while (stack.length > 0) {
			const el = stack.pop()!;
			if (SKIPPED_TAGS.has(el.tagName) || el.hasAttribute(IGNORE_ATTRIBUTE)) continue;
			if (el instanceof HTMLElement || el instanceof SVGElement) planElement(el, writes, marks);
			stack.push(...el.children);
			if (el.shadowRoot) {
				addSheet(el.shadowRoot);
				stack.push(...el.shadowRoot.children);
			}
		}

		// With no background anywhere, the page shows the browser's white canvas, which also goes dark.
		const html = document.documentElement;
		const body = document.body;
		if (root === html && !hasVisibleColor(getComputedStyle(html).backgroundColor) && (!body || !hasVisibleColor(getComputedStyle(body).backgroundColor))) {
			const [r, g, b] = convert([255, 255, 255], 'root');
			writes.push({ el: html, prop: 'background-color', value: `rgb(${r}, ${g}, ${b})` });
		}
		return { writes, marks };
	};

	const observer = new MutationObserver(() => schedule());
	const connect = () => {
		if (!observe) return;
		const config = { subtree: true, childList: true, attributes: true, attributeFilter: OBSERVED_ATTRIBUTES };
		observer.observe(document, config);
		for (const scope of sheets.keys()) if (scope instanceof ShadowRoot) observer.observe(scope, config);
	};

	const run = () => {
		if (!active) return;
		const started = performance.now();
		observer.disconnect();
		const freeze = document.createElement('style');
		freeze.textContent = FREEZE_CSS;
		(document.head ?? document.documentElement).append(freeze);

		// Everything is restored before anything is read, or children would inherit converted colors.
		restore();
		addSheet(document);
		const { writes, marks } = plan();
		writes.forEach(write);
		for (const [el, mark] of marks) {
			el.setAttribute(mark, '');
			marked.add(el);
		}

		void document.documentElement.offsetHeight;
		freeze.remove();
		observer.takeRecords();
		connect();
		lastRun = performance.now();
		lastCost = lastRun - started;
	};

	/** Waits longer on heavy pages, so a page that animates through inline styles stays responsive */
	function schedule() {
		if (timer !== undefined || !active) return;
		const gap = Math.max(minInterval, lastCost * 4);
		timer = setTimeout(() => {
			timer = undefined;
			run();
		}, Math.max(0, lastRun + gap - performance.now()));
	}

	const emulation: Emulation = {
		get active() {
			return active;
		},
		refresh: run,
		stop() {
			if (!active) return;
			active = false;
			clearTimeout(timer);
			timer = undefined;
			observer.disconnect();
			restore();
			for (const sheet of sheets.values()) sheet.remove();
			sheets.clear();
			current = null;
		},
	};

	current = emulation;
	run();
	return emulation;
}
