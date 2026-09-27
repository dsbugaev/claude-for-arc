/**
 * Development only (patch.mjs --dev): lets the agent reload the unpacked
 * extension by calling the navigate tool with url "https://claude-for-arc.invalid/reload",
 * so iterating on the patch does not need a click in arc://extensions.
 */
(() => {
  const OrigWS = globalThis.WebSocket;
  if (!OrigWS || globalThis.__claudeForArcDevReload) return;
  globalThis.__claudeForArcDevReload = true;

  function PatchedWebSocket(url, protocols) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
    if (typeof url === 'string' && url.includes('claudeusercontent.com')) {
      ws.addEventListener('message', evt => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'tool_call' && msg.tool === 'navigate' && /^https?:\/\/claude-for-arc\.invalid\/reload/.test(msg.args?.url || '')) {
            ws.send(JSON.stringify({
              type: 'tool_result',
              tool_use_id: msg.tool_use_id,
              content: [{ type: 'text', text: 'Reloading Claude for Arc' }]
            }));
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
