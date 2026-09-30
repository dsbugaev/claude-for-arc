# Status

## Broken since 2026-09-29 (observed 2026-09-30)

Arc auto-updated to 1.166.0 (Chromium 154) and restarted on 2026-09-29 14:43. Since then Claude Code cannot open its first tab: `tabs_context_mcp` with `createIfEmpty: true` times out in both profiles (5 of 5 calls), so no other tool is reachable. Without `createIfEmpty` it answers at once ("No tab group exists for this session"), so the extension is connected and alive. Cause not found yet: it needs the service worker console in `arc://extensions`. Not yet known whether the Arc update or the restart itself triggers it.

The official extension is already at 1.0.97; the patched build is still 1.0.94.

## Last verified state (2026-09-28)

Published at github.com/dsbugaev/claude-for-arc. Verified live on macOS, Arc 1.165.1, official extension 1.0.94, Claude Code 2.1.283:

- Claude Code: tabs, navigate, find, read_page, click by ref and by coordinates, type, key, form_input, JavaScript, screenshots.
- Side panel opens (built-in chat, window mode), signs in, and its agent acts on the page.
- Install from scratch with `--download` builds from the Chrome Web Store package.

## Next

- Verify in a second Arc profile signed in to a different Claude account.
- Windows: paths are in the script, not tested.

## Known issues

- Clicking a `ref` from `find` once missed a form field; a repeated `find` and click worked.
- Claude Code cannot type into the side panel iframe (not needed for normal use).
