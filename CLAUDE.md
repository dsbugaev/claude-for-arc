# Claude for Arc

Compatibility layer that makes the official Claude in Chrome extension work in the Arc browser: side panel and Claude Code browser control. The repository is public: no Anthropic code, no personal data, English only.

## Layout

- `patch.mjs` - finds or downloads the official extension, copies it to `dist/extension`, adds `src/` and edits the manifest, service worker loader and extension pages.
- `src/tabgroups.js` - tab group emulation (Arc's `chrome.tabGroups` does not work). Also opens the tabs the official code creates in the background in their own Little Arc window: Arc drops clicks, key presses and screenshots in a tab it is not showing.
- `src/sidepanel.js`, `src/panel-injector.js`, `src/viewport-override.js`, `src/cmd-e-fallback.js` - side panel injected into pages.
- `src/dev-reload.js`, `src/dev-trace.js` - included only with `--dev`. `navigate` with `tabId: 1` to `https://claude-for-arc.invalid/reload` reloads the extension, `/trace` returns the log of window, tab and tab group API calls (a hung call stays `pending`), `/state` returns the windows and tabs the profile sees. Pass a `tabId`: without one Claude Code first asks for the tab group.

## Working on it

- Rebuild: `node patch.mjs --dev --download`, then reload (dev hook or the reload arrow in `arc://extensions`).
- Verify in Arc through Claude Code (`mcp__claude-in-chrome__*`): `tabs_context_mcp` with `createIfEmpty`, navigate, `find`, `read_page`, click by ref, `type`, `form_input`, `javascript_tool`, screenshot. Check the side panel opens and acts on the page.
- Never modify files inside the official bundle; add files and entries only.
- Update the tested versions in `patch.mjs` and README after verifying a new official version.
- Status: `docs/STATUS.md`.
