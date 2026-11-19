# samsung-forced-dark-mode

**English** | [한국어](README.ko.md)

An unofficial library that detects Samsung Internet's forced dark mode and imitates it in other browsers. It has no runtime dependencies and is not affiliated with Samsung Electronics.

| Import | What it does |
|---|---|
| `samsung-forced-dark-mode/detect` | Tells you whether forced dark is applied to the current page |
| `samsung-forced-dark-mode/emulate` | Makes a page in any browser look like Samsung Internet's forced dark |
| `samsung-forced-dark-mode` | Both of the above |

## Install

```bash
npm install samsung-forced-dark-mode
```

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';
// or both at once: import { detectForcedDark, emulateForcedDark } from 'samsung-forced-dark-mode';
```

Type declarations are included. Without a bundler, load the files from a CDN, for example `https://unpkg.com/samsung-forced-dark-mode@0.1.1/dist/<file>`.

| File in `dist/` | Use |
|---|---|
| `detect.js`, `emulate.js`, `index.js` | ES modules |
| `detect.d.ts`, `emulate.d.ts`, `index.d.ts` | Type declarations |
| `detect.ts`, `emulate.ts` | Single TypeScript files to copy into your project |
| `detect.global.js`, `emulate.global.js` | For `<script>` tags. They define the globals `SamsungForcedDarkDetect` and `SamsungForcedDarkEmulate` |
| `samsung-forced-dark-mode.auto.js` | Turns the emulation on when loaded, and off when run again |
| `bookmarklet.txt` | Paste into a bookmark's URL field |

## 1. Detecting forced dark

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';

const { state, forced, samsungBrowser, version, sample } = await detectForcedDark();

if (forced) {
  // For example, point people to Menu (≡) → Light mode
}
```

| `state` | Meaning |
|---|---|
| `forced` | Samsung Internet, and the sample was dimmed below the threshold: forced dark is on |
| `not-forced` | Samsung Internet, and no sign of forced dark was found |
| `not-samsung` | Not Samsung Internet |
| `unknown` | Samsung Internet, but the sample could not be read |

`sample` is the red channel read back from a white SVG image (`null` when it could not be read), and `version` is the Samsung Internet version from the user agent, such as `"31.0"`.

| Option | Default | Description |
|---|---|---|
| `threshold` | `250` | A sample below this counts as forced dark |
| `timeoutMs` | `2000` | Gives up and returns `unknown` after this long |
| `userAgent` | `navigator.userAgent` | The user agent to check |

With forced dark on, `prefers-color-scheme` still reports `light` and `getComputedStyle` still returns the original colors. A white SVG image drawn to a canvas, however, reads back as 179 instead of 255, and that is what the detection relies on.

`classify(userAgent, sample, threshold?)` and `samsungVersion(userAgent)` are exported too, for running the same decision on values you collected yourself.

## 2. Making a page look like Samsung Internet

Add one script to the page:

```html
<script src="https://unpkg.com/samsung-forced-dark-mode@0.1.1/dist/samsung-forced-dark-mode.auto.js"></script>
```

With a bundler, `import 'samsung-forced-dark-mode/auto';` does the same. The script runs the detection first, and if Samsung Internet is already forcing dark mode it only logs a warning, because converting the page twice would be wrong.

You can also paste the contents of `samsung-forced-dark-mode.auto.js` into the DevTools console, or save `bookmarklet.txt` as a bookmark. Running it a second time restores the page.

To control it from code:

```ts
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';

const emulation = emulateForcedDark();

emulation.refresh(); // Convert again right away
emulation.stop();    // Restore the page's own styles
emulation.active;    // false after stop()
```

With the `<script>` builds, the same functions hang off the globals:

```html
<script src="https://unpkg.com/samsung-forced-dark-mode@0.1.1/dist/emulate.global.js"></script>
<script>
  const emulation = SamsungForcedDarkEmulate.emulateForcedDark();
</script>
```

| Option | Default | Description |
|---|---|---|
| `root` | The whole document | The subtree to convert |
| `observe` | `true` | Also converts content added or changed later |
| `minIntervalMs` | `200` | Shortest gap between conversions while the page keeps changing |
| `loadResource` | None | `(url) => Promise<Blob \| null>`. Fetches images the page itself cannot read, such as cross-origin images without CORS |

Only one emulation runs at a time: calling `emulateForcedDark()` while one is active returns that one and ignores the new options.

Add the `data-sfd-ignore` attribute to an element to leave it and everything inside it unconverted.

The color conversion is exported on its own as well: `convert(rgb, role)` returns the converted color for a paint role, `luma(rgb)` gives the BT.601 luma, and `rewriteColors(css, role)` converts every color inside a CSS value.

### Chrome extension

The same emulator also comes as a Chrome extension. Clicking the toolbar button turns it on or off for the current tab. It is not in the Chrome Web Store yet and is not part of the npm package, so build it from this repository (Node.js 22.18 or later):

```bash
git clone https://github.com/GUMBOKIM/samsung-forced-dark-mode.git
cd samsung-forced-dark-mode
npm install
npm run extension   # dist/extension, plus dist/extension.zip for the Chrome Web Store
```

Open `chrome://extensions`, turn on Developer mode, and load `dist/extension` with **Load unpacked**.

Running as an extension removes several limits of the script version:

- The extension fetches cross-origin images itself, so the icon rule and per-shape SVG conversion work on most sites. It only fetches `http(s)` images up to 8 MB and never sends cookies with these requests. A page whose Content Security Policy blocks `data:` images can still keep the replaced images from showing.
- The script is injected by the extension, so a strict Content Security Policy does not stop it from running.
- Cross-origin `iframe`s are converted as well.

### Conversion rules

Colors are converted to Y′CbCr (BT.601), and only the luma Y moves into a range that depends on what is being painted. The formula is adapted from Daniel Aleksandersen's [analysis of Samsung Internet 11](https://www.ctrl.blog/entry/samsung-internet-night-mode/). There, colors with a luma of 0.85 or more were left alone; on Samsung Internet 31.0 even white backgrounds are converted, so here 0.85 only decides whether the luma is inverted. The ranges were measured again on Samsung Internet 31.0.

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
| `<img>` bitmaps | Every channel × about 0.7 |
| CSS background bitmaps | Every channel × about 0.5 |
| `canvas` | Unchanged |

The bitmap factors were measured with flat gray and color images; real photos were not measured.

A few more rules apply:

- A page with no background at all is painted `rgb(1, 1, 1)`.
- A box no larger than 20px on both sides gets its background converted with the text range, inverted. Form controls and the page root are excluded. Boxes include 20px, while SVG shapes must be under 20px.
- SVGs used through `<img>` or CSS backgrounds are converted shape by shape, under the same rules as inline SVG.
- A bitmap counts as an icon when it is drawn at most 90px on both sides, at most 79% of its pixels are not fully transparent, and every visible pixel is dark (grays under a luma of about 0.5, colors under about 0.29). Icons get 115 added to every channel. These thresholds are approximations narrowed down with test images. For `<img>`, files larger than 512px are not checked.

## What has been tested

Samsung Internet 31.0.0.81 on an SM-S931N was compared with Chrome running this library. A pixel counts as matching when every channel is within 10.

- **Color conversion:** Matches values measured on Samsung Internet 31.0 within ±1, across 256 gray levels and 11 kinds of painted content, 2,816 values in all (`npm test`). The page-root range and the small SVG shape rule were measured separately.
- **Detection:** Reported `forced` with a value of 179 while forced dark was on. The off state was only covered by unit tests, not tried on a real device.
- **Element comparison:** 277 of 285 cells (97.2%), each combining an element type and a color, matched.
- **Real pages:** Across 13 article and product pages, including BBC, CNN, Naver News and Amazon, an average of 97.2% of pixels matched. 8 of the 13 reached 99% or more, 10 reached 97% or more, and the lowest was 78.3%.

So that both browsers showed identical content, the pages were frozen with their images, fonts and CSS copied locally. That comparison leaves out script behavior, `iframe`, video and `canvas`. Results on live sites may be lower.

## Limitations

- A page cannot change how the browser paints, so the conversion is imitated through the DOM. It will not match Samsung Internet pixel for pixel.
- Colors that change on `:hover` or `:focus` keep their converted resting color.
- In the script version, cross-origin images blocked by CORS cannot be read, so the icon rule does not apply to them. SVG images in that position are converted as a whole by a filter, without the per-shape size rules.
- Gradients with several colors can come out brighter than the real thing.
- Closed Shadow DOM and video are not converted, and neither is the inside of an `iframe` in the script version.
- Only Chrome has been tested. Other browsers may give different results.
- A strict Content Security Policy can block the bookmarklet and the CDN script tag. The extension is not affected.
- Detection was only measured on Samsung Internet 31.0 with the default web page brightness. Version 29 and earlier, and other brightness settings, were not checked.
- A Samsung Internet update could change these values or the detection method.

## Development

Requires Node.js 22.18 or later.

```bash
git clone https://github.com/GUMBOKIM/samsung-forced-dark-mode.git
cd samsung-forced-dark-mode
npm install
npm run demo   # http://localhost:5177
npm test
npm run build  # writes the files above to dist/
```
