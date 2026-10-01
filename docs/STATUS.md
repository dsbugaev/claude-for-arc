# Status

## Current state (2026-09-30)

Works in the personal Arc profile. Verified on macOS, Arc 1.166.0 (Chromium 154), official extension 1.0.97, from Claude Code:

- Tabs, navigate, find, read_page, get_page_text, form_input, JavaScript.
- Click by ref, type, key, screenshot: on the first try, in a tab opened by Claude Code. Such tabs now open in their own Little Arc window (see "Own window" below).
- Side panel: opens on Cmd+E and shows the chat. The panel agent acting on a page was last checked on 1.0.94 (2026-09-28), not on 1.0.97.

The work profile loads the same build after its next extension reload and has not been rechecked.

## Own window for Claude's tabs (2026-09-30)

Arc does not deliver mouse and key presses sent through the debugger to a tab it is not showing, and cannot take a screenshot of it. The official code opens Claude's tab in the background of the user's window (`active: false`), so the first click was lost while the tool still reported "Clicked". This was the "click by ref missed" issue noted on 2026-09-28.

What was measured on one background tab: never shown - click and typing lost, only the mouse move arrived; selected once - delivered; back in the background 1 s and 75 s later and after a new navigation - still delivered. Screenshots failed whenever the tab was not the visible one (3 of 3).

Rejected fix: show the new tab for a moment and restore the previous one. Activating a tab from the extension switches Arc to the space of that tab, and the extension cannot restore the space the user was in: from a space of another profile, and from another space of the same profile, Arc ended up in the space of the new tab (2 of 2).

Chosen fix: `tabs.create` with `active: false` opens the tab in a `popup` window (a Little Arc window) with `focused: false`. It opens behind the current window, the user's space and active tab stay as they were, and click, typing and screenshot work on the first try. A second tab gets a second window; closing the tab closes its window.

With Arc behind another application the click and the screenshot also work (checked once).

Opening a window brings Arc to the front, and Arc stays there until the user switches back. Measured on 2026-10-01 with the user away from the keyboard, every `chrome.windows.create` did it: `popup` with `focused: false` (2 of 2, also with another popup already open), `normal` with `focused: false`, and `popup` with `state: minimized` (Arc ignores the state). The earlier "1-2 seconds, then back" readings were the user switching back.

Not tested: a minimized Little Arc window.

## Open: tab creation hang (2026-09-29 and 2026-09-30)

`tabs_context_mcp` with `createIfEmpty: true` timed out 5 times out of 5, in both profiles, after Arc auto-updated to 1.166.0 and restarted on 2026-09-29 14:43. Without `createIfEmpty` the extension answered at once. Reloading the extension fixed it in the personal profile. The cause is not found.

What is known:

- The hang is before the group record is saved: no `tabGroups` record in extension storage for the failed calls. That leaves `windows.getLastFocused`, `tabs.create` or the first steps of `createGroup`.
- Group creation from the side panel worked in both profiles after the restart (records from 09-29 15:19 and 09-30 14:13), so the session path (new inactive tab in the last focused window) is the suspect. Since the own-window change that path no longer calls the native `tabs.create` for a background tab.
- Ruled out by test: the active space belonging to another profile; an open Little Arc window (it is a `popup` window and is filtered out).
- Not tested: Arc hidden or minimized at the time of the call; stale state in a long-running service worker.

Next time it happens, before reloading: call navigate with `tabId: 1` on `https://claude-for-arc.invalid/trace` and `/state` (dev build) and paste both here. The pending entry in the trace names the call that hangs.

## Next

- Find the cause of the tab creation hang (see above).
- Recheck the work profile (second Claude account) and the panel agent on 1.0.97.
- Decide how to avoid taking the focus: no window option prevents it (see above).
- Test clicks with the Little Arc window minimized.
- Windows: paths are in the script, not tested.

## Known issues

- Every tab Claude Code opens is a separate Little Arc window, and opening it brings Arc to the front.
- `windows.getAll({ populate: true })` returns tabs without the emulated `groupId`.
- Claude Code cannot type into the side panel iframe (not needed for normal use).
