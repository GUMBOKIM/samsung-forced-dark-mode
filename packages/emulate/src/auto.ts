/**
 * The drop-in build. Load it with a script tag, paste it into the console, or run it as a
 * bookmarklet: the first run turns the emulation on and the next run turns it off.
 */
import { detectForcedDark } from '../../detect/src/index.ts';
import { emulateForcedDark, type Emulation } from './index.ts';

const KEY = '__samsungForcedDark';
const scope = window as unknown as Record<string, Emulation | undefined>;

const running = scope[KEY];
if (running?.active) {
	running.stop();
	delete scope[KEY];
} else {
	void detectForcedDark().then(({ forced }) => {
		// The browser is already converting this page, and converting it twice would be wrong.
		if (forced) {
			console.warn('[samsung-forced-dark-mode] Samsung Internet is already forcing dark mode here.');
			return;
		}
		scope[KEY] = emulateForcedDark();
	});
}
