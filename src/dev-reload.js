/**
 * Development only (patch.mjs --dev): lets the agent reach the unpacked extension
 * through the navigate tool, so iterating on the patch does not need a click in
 * arc://extensions or the service worker console.
 *
 *   https://claude-for-arc.invalid/reload  reloads the extension
 *   https://claude-for-arc.invalid/trace   returns the API call log (dev-trace.js)
 *   https://claude-for-arc.invalid/state   returns the windows and tabs this profile sees
 *
 * Pass any tabId: without one Claude Code first asks for the tab group, and that
 * is the call that may be broken.
 */
(() => {
  const OrigWS = globalThis.WebSocket;
  if (!OrigWS || globalThis.__claudeForArcDevReload) return;
  globalThis.__claudeForArcDevReload = true;

  function trace() {
    const log = globalThis.__claudeForArcTrace || [];
    const recent = log.slice(-80);
    const pending = log.filter(e => e.state === 'pending' && !recent.includes(e));
    return JSON.stringify({ version: chrome.runtime.getManifest().version_name, pending, recent });
  }

  function host(url) {
    try { return new URL(url).host || url.split('/')[0]; } catch (e) { return ''; }
  }

  async function state() {
    const windows = await chrome.windows.getAll({ populate: true });
    return JSON.stringify(windows.map(w => ({
      id: w.id, type: w.type, focused: w.focused, state: w.state, width: w.width, height: w.height,
      tabs: (w.tabs || []).map(t => ({ id: t.id, active: t.active, groupId: t.groupId, host: host(t.url || t.pendingUrl || '') }))
    })));
  }

  function PatchedWebSocket(url, protocols) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
    if (typeof url === 'string' && url.includes('claudeusercontent.com')) {
      ws.addEventListener('message', evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type !== 'tool_call' || msg.tool !== 'navigate') return;
          const command = /^https?:\/\/claude-for-arc\.invalid\/(reload|trace|state)/.exec(msg.args?.url || '')?.[1];
          if (!command) return;
          const reply = text => ws.send(JSON.stringify({
            type: 'tool_result',
            tool_use_id: msg.tool_use_id,
            content: [{ type: 'text', text }]
          }));
          if (command === 'trace') reply(trace());
          else if (command === 'state') state().then(reply, e => reply(`state failed: ${e?.message || e}`));
          else {
            reply('Reloading Claude for Arc');
            setTimeout(() => chrome.runtime.reload(), 200);
          }
        } catch (e) {}
      });
    }
    return ws;
  }
  PatchedWebSocket.prototype = OrigWS.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) PatchedWebSocket[k] = OrigWS[k];
  globalThis.WebSocket = PatchedWebSocket;
})();
