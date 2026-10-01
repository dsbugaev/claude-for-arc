/**
 * Development only (patch.mjs --dev): lets the agent reach the unpacked extension
 * through the navigate tool, so iterating on the patch does not need a click in
 * arc://extensions or the service worker console.
 *
 *   https://claude-for-arc.invalid/reload  reloads the extension
 *   https://claude-for-arc.invalid/trace   returns the last API calls (dev-trace.js),
 *                                          add ?full to include their results
 *   https://claude-for-arc.invalid/state   returns the windows and tabs this profile sees
 *   https://claude-for-arc.invalid/window?type=popup&focused=false   creates a window with
 *                                          these chrome.windows.create options (test bench)
 *   https://claude-for-arc.invalid/close?id=123   closes window 123
 *
 * Pass any tabId: without one Claude Code first asks for the tab group, and that
 * is the call that may be broken.
 */
(() => {
  const OrigWS = globalThis.WebSocket;
  if (!OrigWS || globalThis.__claudeForArcDevReload) return;
  globalThis.__claudeForArcDevReload = true;

  function trace(full) {
    const log = globalThis.__claudeForArcTrace || [];
    const recent = log.slice(-40);
    const pending = log.filter(e => e.state === 'pending' && !recent.includes(e));
    const compact = ({ result, ...entry }) => (full ? { ...entry, result } : entry);
    return JSON.stringify({
      version: chrome.runtime.getManifest().version_name,
      pending: pending.map(compact),
      recent: recent.map(compact)
    });
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

  function options(url) {
    const opts = {};
    for (const [k, v] of new URL(url).searchParams) {
      opts[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(v) ? Number(v) : v;
    }
    return opts;
  }

  async function bench(command, url) {
    if (command === 'close') {
      await chrome.windows.remove(options(url).id);
      return 'closed';
    }
    const opts = options(url);
    const w = await chrome.windows.create(opts);
    return JSON.stringify({ opts, id: w.id, type: w.type, state: w.state, focused: w.focused, tab: w.tabs?.[0]?.id });
  }

  function PatchedWebSocket(url, protocols) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
    if (typeof url === 'string' && url.includes('claudeusercontent.com')) {
      ws.addEventListener('message', evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type !== 'tool_call' || msg.tool !== 'navigate') return;
          const command = /^https?:\/\/claude-for-arc\.invalid\/(reload|trace|state|window|close)\b/.exec(msg.args?.url || '')?.[1];
          if (!command) return;
          const reply = text => ws.send(JSON.stringify({
            type: 'tool_result',
            tool_use_id: msg.tool_use_id,
            content: [{ type: 'text', text }]
          }));
          if (command === 'trace') reply(trace(/[?&]full\b/.test(msg.args.url)));
          else if (command === 'state') state().then(reply, e => reply(`state failed: ${e?.message || e}`));
          else if (command === 'window' || command === 'close') {
            bench(command, msg.args.url).then(reply, e => reply(`${command} failed: ${e?.message || e}`));
          }
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
