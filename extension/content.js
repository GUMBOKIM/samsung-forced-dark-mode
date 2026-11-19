// Runs in every frame of the tab. The first run turns the emulation on and the next one turns it off.
(() => {
	const state = (globalThis.__sfdExtension ??= { emulation: null });
	const report = (on) => chrome.runtime.sendMessage({ type: 'state', on }).catch(() => {});

	if (state.emulation?.active) {
		state.emulation.stop();
		state.emulation = null;
		report(false);
		return;
	}

	/** Cross-origin images are fetched by the extension, so icons and SVG images convert on any site */
	const loadResource = async (url) => {
		const image = await chrome.runtime.sendMessage({ type: 'fetch', url }).catch(() => null);
		if (!image) return null;
		const binary = atob(image.base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return new Blob([bytes], { type: image.type });
	};

	state.emulation = globalThis.SamsungForcedDarkEmulate.emulateForcedDark({ loadResource });
	report(true);
})();
