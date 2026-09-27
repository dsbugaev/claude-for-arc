/**
 * chrome.sidePanel polyfill for Arc (service worker).
 *
 * Arc has no native side panel. Opening the panel is forwarded to
 * panel-injector.js, which shows sidepanel.html in an iframe docked to the
 * right edge of the page. Based on the approach from chxsong/Claude-in-Arc (MIT).
 */
(() => {
  if (globalThis.__claudeForArcSidePanel) return;
  globalThis.__claudeForArcSidePanel = true;

  // Keep the native panel from swallowing toolbar clicks.
  try { chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {}); } catch (e) {}

  async function send(tabId, type) {
    if (typeof tabId !== 'number') return;
    try { await chrome.tabs.sendMessage(tabId, { type, tabId }); } catch (e) {
      // No content script on this page (arc://, Web Store, a tab opened before install).
    }
  }

  async function activeTabId(windowId) {
    const [tab] = await chrome.tabs.query(
      windowId !== undefined ? { active: true, windowId } : { active: true, lastFocusedWindow: true }
    );
    return tab?.id;
  }

  chrome.action?.onClicked.addListener(tab => send(tab?.id, 'TOGGLE_INJECTED_PANEL'));

  chrome.commands?.onCommand.addListener(async (command, tab) => {
    if (command === 'toggle-side-panel') send(tab?.id ?? await activeTabId(), 'TOGGLE_INJECTED_PANEL');
  });

  const options = {};
  const behavior = { openPanelOnActionClick: false };

  const sidePanel = {
    async open(opts = {}) {
      send(opts.tabId ?? await activeTabId(opts.windowId), 'SHOW_INJECTED_PANEL');
    },
    async close(opts = {}) {
      send(opts.tabId ?? await activeTabId(opts.windowId), 'HIDE_INJECTED_PANEL');
    },
    async setOptions(opts) { Object.assign(options, opts); },
    async getOptions() { return { ...options }; },
    async setPanelBehavior(b) { Object.assign(behavior, b); },
    async getPanelBehavior() { return { ...behavior }; },
    onOpened: { addListener() {}, removeListener() {}, hasListener() { return false; } },
    onClosed: { addListener() {}, removeListener() {}, hasListener() { return false; } }
  };

  try {
    Object.defineProperty(chrome, 'sidePanel', { value: sidePanel, configurable: true, writable: true });
  } catch (e) {
    chrome.sidePanel = sidePanel;
  }

  // Helpers for panel-injector.js: page zoom and the tab id of the page.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'CLAUDE_ARC_GET_ZOOM') {
      if (!sender.tab?.id) { sendResponse({ zoom: 1 }); return false; }
      chrome.tabs.getZoom(sender.tab.id, zoom => sendResponse({ zoom: chrome.runtime.lastError ? 1 : zoom }));
      return true;
    }
    if (message?.type === 'CLAUDE_ARC_GET_TAB_ID') {
      sendResponse({ tabId: sender.tab?.id ?? null });
      return false;
    }
  });

  chrome.tabs.onZoomChange?.addListener(info => {
    chrome.tabs.sendMessage(info.tabId, { type: 'CLAUDE_ARC_ZOOM_CHANGED', zoom: info.newZoomFactor }).catch(() => {});
  });
})();
