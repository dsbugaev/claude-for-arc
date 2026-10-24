# Status

## Arc shuts down, Dia works without the patch (2026-10-24)

- The Browser Company shuts Arc down on 2026-12-22 (member email of 2026-10-22, arc.net). After that date the Arc account cannot be used and Arc stops working; account data is deleted within 30 days. The recommended replacement is Dia, which imports Arc spaces (as Dia profiles), pinned tabs, folders, logins, passwords and extensions.
- Tested on macOS: Dia 1.54.2 (Chromium 156) and the official Claude in Chrome 1.0.102 from the Chrome Web Store, no patch. After the Arc import Dia has two Chromium profiles, personal and work, each with its own copy of the extension signed in to its own Claude account. Both connected to Claude Code with no native messaging host file in Dia's folder.
- Works in both profiles: tab group, navigate, read_page, find, get_page_text, form_input, javascript_tool, click by ref and by coordinates, type, key, screenshot, zoom. In a background tab that was never shown, clicks, typing and screenshots also work, and the user's visible tab does not change.
- Limitation: a new tab (`tabs_context_mcp` with `createIfEmpty`, `tabs_create_mcp`) fails with "Tab not found for session ID: TabSessionID(value: N)" while the Dia window shows a profile of the other Claude account (3 of 3). No stray tabs are left. Tabs already in Claude's group keep working.
- Seen in another session the same day: "Security check failed: the page navigated to a different domain" when a page navigates while JavaScript runs (re-read the tab and retry); a navigation started from JavaScript with `setTimeout` did not happen; "CDP Runtime.evaluate timed out" when the page is busy for more than about 45 s (same in Arc).
- Not checked: the side panel in Dia.
- Decision: day-to-day agent work moved to Dia. The patch stays in both Arc profiles until Arc shuts down. The open issues below are no longer investigated.

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

2026-10-05, personal profile, extension 1.0.97-arc: the hang came back (2 of 2 calls). The trace had **no pending entries**; its last records were `windows.getLastFocused` → `tabs.create` (`active: false`) and `windows.create` (`type: popup`) → `tabs.get` → `tabs.group` into the new popup window, all `ok` in under 60 ms. `/state` showed two leftover `about:blank` tabs: one in the normal window, one alone in a popup window, both with `groupId: -1`. So the traced window and tab APIs all return; the hang is after them (group bookkeeping or the reply to Claude Code), not in a native call. Reload fixed it on the first try.

2026-10-15, personal profile, extension 1.0.97-arc: same picture. One `createIfEmpty` call timed out; the trace had **no pending entries** and ended with `windows.getLastFocused` → `tabs.create` → `windows.create` (`popup`) → `tabs.get` → `tabs.group`, all `ok`. A follow-up `tabs_context_mcp` without `createIfEmpty` answered "No tab group exists", so the group record was never saved. `/state` was not captured. Reload fixed it on the first try.

2026-10-22, personal profile, extension 1.0.97-arc: the first `createIfEmpty` call of a session timed out again. The trace had **no pending entries** and ended with `windows.getLastFocused` → `tabs.create` (`chrome://newtab/`, `active: false`) and `windows.create` (`popup`, `about:blank`) started in the same millisecond → `tabs.get` ×3 on the popup's tab → `tabs.group` of that tab into the popup window, all `ok` (max 110 ms). A follow-up call without `createIfEmpty` answered "No tab group exists". `/state`: the popup window holds one `about:blank` tab with `groupId: -1`; the normal window has no leftover new tab this time. Reload fixed it on the first try.

2026-10-24, personal profile, extension 1.0.97-arc: the first `createIfEmpty` call of a session timed out twice in a row. The trace had **no pending entries**; both attempts ended with `windows.getLastFocused` → `tabs.create` (`chrome://newtab/`, `active: false`) and `windows.create` (`popup`) → `tabs.get` ×3 → `tabs.group`, all `ok`. A call without `createIfEmpty` answered "No tab group exists". `/state`: only the normal window, neither popup window nor their tabs were left. Reload fixed it on the first try.

## Open: Claude's popup window disappears during long work (2026-10-15)

A page script ran for several minutes in a Claude tab (a long chain of `fetch` calls started from `javascript_tool`). Twice within about 5 minutes the next `javascript_tool` call failed with "Couldn't determine which page this action targets", `tabs_context_mcp` said "No tab group exists", and `/state` showed only the normal window: the popup window and its tab were gone. Not known whether the user closed the window (it had just come to the front) or Arc closed it. A third run of about 8 minutes finished without it. Until this is understood, make long page jobs resumable.

Also: a `javascript_tool` call that awaits about 25 seconds times out. Start long jobs without awaiting them and poll their state in later calls.

## Next

- Until 2026-12-22: keep the patch working in Arc only as needed; no new features.
- After Arc shuts down: decide whether to archive the repository.

Dropped on 2026-10-24 because Arc is going away: finding the cause of the tab creation hang, rechecking the work profile and the panel agent on 1.0.97, one persistent window for Claude's tabs, clicks with a minimized Little Arc window, testing on Windows.

## Known issues

- Every tab Claude Code opens is a separate Little Arc window, and opening it brings Arc to the front.
- `windows.getAll({ populate: true })` returns tabs without the emulated `groupId`.
- Claude Code cannot type into the side panel iframe (not needed for normal use).
