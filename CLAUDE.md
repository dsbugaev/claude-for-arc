# Claude for Arc

Compatibility layer that makes the official Claude in Chrome extension work in the Arc browser: side panel and Claude Code browser control. The repository is public: no Anthropic code, no personal data, English only.

## Layout

- `patch.mjs` - finds or downloads the official extension, copies it to `dist/extension`, adds `src/` and edits the manifest, service worker loader and extension pages.
- `src/tabgroups.js` - tab group emulation (Arc's `chrome.tabGroups` does not work).
- `src/sidepanel.js`, `src/panel-injector.js`, `src/viewport-override.js`, `src/cmd-e-fallback.js` - side panel injected into pages.
- `src/dev-reload.js` - included only with `--dev`: `navigate` to `https://claude-for-arc.invalid/reload` reloads the extension.

## Working on it

- Rebuild: `node patch.mjs --dev --download`, then reload (dev hook or the reload arrow in `arc://extensions`).
- Verify in Arc through Claude Code (`mcp__claude-in-chrome__*`): `tabs_context_mcp` with `createIfEmpty`, navigate, `find`, `read_page`, click by ref, `type`, `form_input`, `javascript_tool`, screenshot. Check the side panel opens and acts on the page.
- Never modify files inside the official bundle; add files and entries only.
- Update the tested versions in `patch.mjs` and README after verifying a new official version.
- Status: `docs/STATUS.md`.
