# Privacy policy for Forced Dark Preview for Samsung Internet

Last updated: 2026-11-19

Forced Dark Preview for Samsung Internet is a Chrome extension that repaints the current tab to show how Samsung Internet's forced dark mode would display it. It is an unofficial project and is not affiliated with Samsung Electronics.

## What the extension collects

Nothing. The extension does not collect, store, sell or share any personal data, browsing history or page content. It has no analytics, no accounts and no remote server.

## What happens when you click the toolbar button

- The extension changes the colors of the page in the current tab, inside your browser. Clicking again puts the page back as it was. Nothing is saved.
- To convert icons and SVG images that the page loads from other sites, the extension downloads those same image files again. These requests go straight to the image's own server, are sent without cookies, and are dropped if the response is not an image. The images are only kept in memory while the page is open.

## Permissions

- `activeTab` and `scripting`: to run the color conversion in the tab where you clicked the button.
- Access to all sites: so the conversion also reaches frames and images that come from other sites than the page itself. The extension does nothing on a page until you click its button.

## Contact

Questions about this policy: open an issue at https://github.com/GUMBOKIM/samsung-forced-dark-mode/issues
