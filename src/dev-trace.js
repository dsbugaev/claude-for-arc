/**
 * Development only (patch.mjs --dev): records the window, tab and tab group API
 * calls made by the official code, with their outcome. Read the log from Claude
 * Code with the navigate tool and url "https://claude-for-arc.invalid/trace"
 * (see dev-reload.js). A call that never settles stays "pending", which is how
 * a hung tool call shows up.
 *
 * Loaded after tabgroups.js, so it sees the emulated group APIs.
 */
(() => {
  if (globalThis.__claudeForArcTrace) return;
  const log = globalThis.__claudeForArcTrace = [];
  const started = Date.now();
  let seq = 0;

  function brief(value) {
    try {
      const s = JSON.stringify(value);
      return s && s.length > 300 ? `${s.slice(0, 300)}...` : s;
    } catch (e) {
      return String(value);
    }
  }

  function record(entry) {
    log.push(entry);
    if (log.length > 400) log.shift();
    return entry;
  }

  function wrap(obj, ns, names) {
    if (!obj) return;
    for (const name of names) {
      const fn = obj[name];
      if (typeof fn !== 'function') continue;
      obj[name] = function (...args) {
        const entry = record({
          n: ++seq,
          at: Date.now() - started,
          api: `${ns}.${name}`,
          args: brief(args.filter(a => typeof a !== 'function')),
          state: 'pending'
        });
        const done = (state, extra) => Object.assign(entry, { state, ms: Date.now() - started - entry.at }, extra);
        let result;
        try {
          result = fn.apply(this, args);
        } catch (e) {
          done('threw', { error: String(e?.message || e) });
          throw e;
        }
        if (result && typeof result.then === 'function') {
          result.then(
            v => done('ok', { result: brief(v) }),
            e => done('rejected', { error: String(e?.message || e) })
          );
        } else {
          done('returned');
        }
        return result;
      };
    }
  }

  wrap(chrome.windows, 'windows', ['getLastFocused', 'getCurrent', 'getAll', 'get', 'create', 'update']);
  wrap(chrome.tabs, 'tabs', ['create', 'group', 'ungroup', 'query', 'get', 'update', 'remove']);
  wrap(chrome.tabGroups, 'tabGroups', ['get', 'query', 'update', 'move']);

  globalThis.addEventListener?.('unhandledrejection', evt => {
    record({ n: ++seq, at: Date.now() - started, api: 'unhandledrejection', error: String(evt.reason?.message || evt.reason) });
  });
  globalThis.addEventListener?.('error', evt => {
    record({ n: ++seq, at: Date.now() - started, api: 'error', error: String(evt.message || evt.error) });
  });
})();
