// Toggles the emulation in the current tab and fetches images the page itself may not read.

/** Images larger than this are left to the page, since converting them costs more than it shows */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function toggle(tab) {
	if (tab?.id === undefined) return;
	// The URL is hidden when site access is limited, so pages Chrome refuses simply fail here.
	try {
		await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['emulate.js', 'content.js'] });
	} catch (error) {
		console.warn('Could not run on this page:', error);
	}
}

chrome.action.onClicked.addListener(toggle);
self.toggle = toggle;

// A new page starts without the emulation, so the badge has to go too.
chrome.tabs.onUpdated.addListener((tabId, change) => {
	if (change.status === 'loading') chrome.action.setBadgeText({ tabId, text: '' });
});

/** Returns the image as base64, or null for anything that is not an image */
async function fetchImage(url) {
	try {
		if (!/^https?:/.test(url)) return null;
		// Cookies are left out, so a page can never use this to read signed-in content.
		const response = await fetch(url, { credentials: 'omit' });
		const type = response.headers.get('content-type') ?? '';
		if (!response.ok || !type.startsWith('image/')) return null;
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length > MAX_IMAGE_BYTES) return null;
		let binary = '';
		for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		return { type: type.split(';')[0], base64: btoa(binary) };
	} catch {
		return null;
	}
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
	if (message?.type === 'state' && sender.tab?.id !== undefined && sender.frameId === 0) {
		chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.on ? 'ON' : '' });
		chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#1a73e8' });
		return false;
	}
	if (message?.type === 'fetch') {
		fetchImage(String(message.url)).then(reply);
		return true;
	}
	return false;
});
