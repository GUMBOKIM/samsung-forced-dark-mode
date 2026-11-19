# samsung-forced-dark-mode

**English** | [한국어](README.ko.md)

An unofficial library that detects Samsung Internet's forced dark mode and reproduces it in other browsers. It has no runtime dependencies and is not affiliated with Samsung Electronics.

| Package | What it does |
|---|---|
| [`packages/detect`](packages/detect) | Tells you whether forced dark is applied to the current page |
| [`packages/emulate`](packages/emulate) | Makes a page in any browser look like Samsung Internet's forced dark |

## Install

```bash
npm install samsung-forced-dark-mode
```

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';
// or both at once: import { detectForcedDark, emulateForcedDark } from 'samsung-forced-dark-mode';
```

Type declarations are included. Without a bundler, the files below can also be used directly from a CDN such as `https://unpkg.com/samsung-forced-dark-mode/dist/<file>`.

| File | Use |
|---|---|
| `detect.js`, `emulate.js`, `index.js` | ES modules |
| `detect.d.ts`, `emulate.d.ts`, `index.d.ts` | Type declarations |
| `detect.ts`, `emulate.ts` | Single TypeScript files to copy into your project |
| `detect.global.js`, `emulate.global.js` | For `<script>` tags. Globals: `SamsungForcedDarkDetect`, `SamsungForcedDarkEmulate` |
| `samsung-forced-dark-mode.auto.js` | Applies itself as soon as it loads. Run it again to turn it off |
| `bookmarklet.txt` | Paste into a bookmark's URL field |

## Development

```bash
npm install
npm run demo   # http://localhost:5177
npm test
npm run build  # writes everything above to dist/
```

## 1. Detecting forced dark

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';

const { state, forced, sample } = await detectForcedDark();

if (forced) {
  // For example, point people to Menu (≡) → Light mode
}
```

| `state` | Meaning |
|---|---|
| `forced` | Samsung Internet is applying forced dark |
| `not-forced` | Samsung Internet, with forced dark off |
| `not-samsung` | Not Samsung Internet |
| `unknown` | Samsung Internet, but the value could not be read |

With forced dark on, `prefers-color-scheme` still reports `light` and `getComputedStyle` still returns the original colors. A white SVG image drawn to a canvas, however, reads back as 179 instead of 255, and that is what the detection relies on.

## 2. Making a page look like Samsung Internet

Add one script to the page:

```html
<script src="https://unpkg.com/samsung-forced-dark-mode/dist/samsung-forced-dark-mode.auto.js"></script>
```

You can also paste the contents of `samsung-forced-dark-mode.auto.js` into the DevTools console, or save `bookmarklet.txt` as a bookmark. Running it a second time restores the page.

To control it from code:

```ts
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';

const emulation = emulateForcedDark();

emulation.refresh(); // Convert again right away
emulation.stop();    // Restore the page's own styles
```

| Option | Default | Description |
|---|---|---|
| `root` | The whole document | The subtree to convert |
| `observe` | `true` | Also converts content added or changed later |
| `minIntervalMs` | `200` | Shortest gap between conversions while the page keeps changing |

Add the `data-sfd-ignore` attribute to any element that should stay unconverted.

### Chrome extension

The same emulator also ships as a Chrome extension. Clicking the toolbar button turns it on or off for the current tab.

```bash
npm run extension   # dist/extension, plus dist/extension.zip for the Chrome Web Store
```

Open `chrome://extensions`, turn on Developer mode, and load `dist/extension` with **Load unpacked**.

Running as an extension removes several limits of the script version:

- Cross-origin images are fetched by the extension, so the icon rule and per-shape SVG conversion work on any site. Cookies are never sent with these requests.
- Pages with a strict Content Security Policy work too.
- Cross-origin `iframe`s are converted as well.

### Conversion rules

Colors are converted to Y′CbCr (BT.601), and only the luma Y moves into a range that depends on what is being painted. The formula comes from Daniel Aleksandersen's [analysis of Samsung Internet 11](https://www.ctrl.blog/entry/samsung-internet-night-mode/). The ranges were measured again on Samsung Internet 31.0.

```
m  = (invert && y < 0.85) ? 1 - y : y
y' = min + m × (max - min)
```

| Painted as | Range |
|---|---|
| `<html>` background, or `<body>` background when `<html>` has none | 0.004 – 0.08 |
| Other backgrounds | 0.004 – 0.12 |
| `input`, `textarea` background | 0.067 – 0.165 |
| `button`, `select` background | 0.15 – 0.29 |
| Gradients | 0.02 – 0.12 |
| Borders | 0.27 – 0.33 |
| Outlines | 0.14 – 0.20 |
| Shadows | 0.28 – 0.33 |
| SVG shapes | 0.50 – 0.70 |
| SVG shapes under 20px on both sides (inverted) | 0.50 – 0.70 |
| SVG `rect`, `circle`, `ellipse` with a side of 90px or more | 0.15 – 0.29 |
| Text (inverted) | 0.29 – 1.00 |
| `<img>` | Every channel × 0.7 |
| CSS background images | Every channel × 0.5 |
| `canvas` | Unchanged |

A few more rules apply:

- A page with no background at all is painted `rgb(1, 1, 1)`.
- A box no larger than 20px on both sides has its background inverted like text.
- SVGs used through `<img>` or CSS backgrounds are converted shape by shape, under the same rules as inline SVG.
- A bitmap counts as an icon when it is at most 90px on both sides, at most 79% of its pixels are opaque, and every visible pixel is dark. Icons get 115 added to every channel.

## What has been tested

Samsung Internet 31.0.0.81 was compared with Chrome 157 on the same SM-S931N phone. A pixel counts as matching when every channel is within 10.

- **Color conversion:** Matches values measured on Samsung Internet 31.0 within ±1, across 256 gray levels and 11 kinds of painted content (`npm test`).
- **Detection:** Reported `forced` with a value of 179 while forced dark was on. The off state was only covered by unit tests, not tried on a real device.
- **Element comparison:** 277 of 285 cells (97.2%), each combining an element type and a color, matched.
- **Real pages:** Across 13 article and product pages, including BBC, CNN, Naver News and Amazon, an average of 97.2% of pixels matched. 8 of the 13 reached 99% or more, 10 reached 97% or more, and the lowest was 78.3%.

So that both browsers showed identical content, the pages were frozen with their images, fonts and CSS copied locally. That comparison leaves out script behavior, `iframe`, video and `canvas`. Results on live sites may be lower.

## Limitations

- A page cannot change how the browser paints, so the conversion is imitated through the DOM. It will not match Samsung Internet pixel for pixel.
- Colors that change on `:hover` or `:focus` are not converted.
- In the script version, cross-origin images blocked by CORS cannot be read, so the icon rule does not apply to them. SVG images in that position are converted as a whole by a filter, without the per-shape size rules.
- Gradients with several colors can come out brighter than the real thing.
- Closed Shadow DOM and video are not converted, and neither is the inside of an `iframe` in the script version.
- Only Chrome has been tested. Other browsers may give different results.
- A strict Content Security Policy can block the bookmarklet. The extension is not affected.
- A Samsung Internet update could change these values or the detection method.
