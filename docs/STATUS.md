# Status

## Current state (2026-09-30)

Works again in the personal Arc profile after an extension reload. Verified on macOS, Arc 1.166.0 (Chromium 154), official extension 1.0.97, from Claude Code:

- Always: tabs, navigate, find, read_page, get_page_text, form_input, JavaScript.
- Click by ref and by coordinates, type, key: only after Claude's tab has been shown in Arc once. Screenshots: only while it is the visible tab (see Known issues).
- Side panel on 1.0.97: the panel host opens on Cmd+E; its content was not checked. The full panel check was last done on 1.0.94 (2026-09-28).

The work profile still runs the build it loaded on 2026-09-29 and has not been rechecked.

## Open: tab creation hang (2026-09-29 and 2026-09-30)

`tabs_context_mcp` with `createIfEmpty: true` timed out 5 times out of 5, in both profiles, after Arc auto-updated to 1.166.0 and restarted on 2026-09-29 14:43. Without `createIfEmpty` the extension answered at once. Reloading the extension fixed it in the personal profile. The cause is not found.

What is known:

- The hang is before the group record is saved: no `tabGroups` record in extension storage for the failed calls. That leaves `windows.getLastFocused`, `tabs.create` or the first steps of `createGroup`.
- Group creation from the side panel worked in both profiles after the restart (records from 09-29 15:19 and 09-30 14:13), so the session path (new inactive tab in the last focused window) is the suspect.
- Ruled out by test: the active space belonging to another profile; an open Little Arc window (it is a `popup` window and is filtered out).
- Not tested: Arc hidden or minimized at the time of the call; stale state in a long-running service worker.

Next time it happens, before reloading: call navigate with `tabId: 1` on `https://claude-for-arc.invalid/trace` and `/state` (dev build) and paste both here. The pending entry in the trace names the call that hangs.

## Next

- Make clicks work without a manual step: show a newly created tab once and switch back, or open Claude's tabs in their own window. Needs a decision, it changes what the user sees. Check first whether activating a tab from the extension switches Arc to another space.
- Find the cause of the tab creation hang (see above).
- Check the side panel content on 1.0.97, then add it to `TESTED_VERSIONS`.
- Recheck the work profile (second Claude account).
- Windows: paths are in the script, not tested.

## Known issues

- Clicks and key presses are dropped in a tab Arc has never shown. The official code opens Claude's tab in the background (`active: false`); such a tab receives only the mouse move, the press, release and key events are dropped, and the tool still reports "Clicked". Controlled run on 2026-09-30, one tab: never shown - click and typing lost; selected - delivered; back in the background, 1 s and 75 s later and after a new navigation - still delivered. This is the "click by ref missed" issue noted on 2026-09-28.
- Screenshots fail with "Failed to capture screenshot via CDP" when Claude's tab is not the visible one (3 of 3), and work when it is.
- Not explained: on another tab that was not selected by the test, one screenshot and one click went through and the next 4 clicks were lost. The user may have opened that tab, or a second factor is involved (Arc window in front or not).
- `windows.getAll({ populate: true })` returns tabs without the emulated `groupId`.
- Claude Code cannot type into the side panel iframe (not needed for normal use).
