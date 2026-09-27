# Status

## Current state (2026-09-28)

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
