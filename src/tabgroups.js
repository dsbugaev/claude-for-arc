/**
 * Tab group emulation for Arc.
 *
 * Arc exposes chrome.tabGroups / chrome.tabs.group but they do not work, and the
 * official extension builds every browser session on a tab group: it groups the
 * tabs it drives, then checks `tab.groupId` before acting. Without groups every
 * tool call stalls.
 *
 * This file replaces the group APIs with an in-memory model persisted in
 * chrome.storage.session, so the service worker and extension pages (side panel,
 * options) share one view. Tabs returned by chrome.tabs.* carry the emulated
 * `groupId`. Nothing is grouped visually in Arc.
 *
 * Loaded before the official code: first import in the service worker, first
 * classic <script> in extension pages.
 */
(() => {
  if (globalThis.__claudeForArcTabGroups) return;
  globalThis.__claudeForArcTabGroups = true;

  const NONE = -1;
  const KEY = 'claudeForArc.tabGroups';
  const COLORS = {
    GREY: 'grey', BLUE: 'blue', RED: 'red', YELLOW: 'yellow', GREEN: 'green',
    PINK: 'pink', PURPLE: 'purple', CYAN: 'cyan', ORANGE: 'orange'
  };

  const tabs = chrome.tabs;
  const orig = {
    get: tabs.get.bind(tabs),
    query: tabs.query.bind(tabs),
    create: tabs.create.bind(tabs),
    update: tabs.update.bind(tabs),
    duplicate: tabs.duplicate?.bind(tabs)
  };

  // state = { groups: { [id]: {id,title,color,collapsed,windowId} }, members: { [tabId]: groupId } }
  let state = { groups: {}, members: {} };
  const ready = chrome.storage.session.get(KEY)
    .then(r => { if (r[KEY]) state = r[KEY]; })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[KEY]) {
      state = changes[KEY].newValue || { groups: {}, members: {} };
    }
  });

  // Re-read before every write: the service worker and the side panel both mutate.
  async function mutate(fn) {
    await ready;
    try {
      const r = await chrome.storage.session.get(KEY);
      if (r[KEY]) state = r[KEY];
    } catch (e) {}
    const result = fn(state);
    try { await chrome.storage.session.set({ [KEY]: state }); } catch (e) {}
    return result;
  }

  function groupOf(tabId) {
    const g = state.members[tabId];
    return g === undefined ? NONE : g;
  }

  function annotate(tab) {
    if (tab && typeof tab === 'object' && typeof tab.id === 'number') {
      try { tab.groupId = groupOf(tab.id); } catch (e) {}
    }
    return tab;
  }

  function dropEmptyGroups(s) {
    const used = new Set(Object.values(s.members));
    for (const id of Object.keys(s.groups)) {
      if (!used.has(Number(id))) delete s.groups[id];
    }
  }

  function newGroupId() {
    // Large random ids so two contexts creating groups at once do not collide.
    return 1000000 + Math.floor(Math.random() * 900000000);
  }

  function withCallback(promise, cb) {
    if (typeof cb === 'function') {
      promise.then(v => cb(v), () => cb(undefined));
      return undefined;
    }
    return promise;
  }

  // ─── chrome.tabs ───

  tabs.get = function (tabId, cb) {
    return withCallback(ready.then(() => orig.get(tabId)).then(annotate), cb);
  };

  tabs.query = function (queryInfo = {}, cb) {
    const p = ready.then(async () => {
      const { groupId, ...rest } = queryInfo || {};
      const list = await orig.query(rest);
      list.forEach(annotate);
      return groupId === undefined ? list : list.filter(t => t.groupId === groupId);
    });
    return withCallback(p, cb);
  };

  tabs.create = function (props, cb) {
    return withCallback(orig.create(props).then(annotate), cb);
  };

  tabs.update = function (...args) {
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
    return withCallback(orig.update(...args).then(annotate), cb);
  };

  if (orig.duplicate) {
    tabs.duplicate = function (tabId, cb) {
      return withCallback(orig.duplicate(tabId).then(annotate), cb);
    };
  }

  tabs.group = function (options = {}, cb) {
    const p = (async () => {
      const ids = [].concat(options.tabIds ?? []).filter(id => typeof id === 'number');
      if (ids.length === 0) throw new Error('No tabs specified');
      let windowId = options.createProperties?.windowId;
      if (windowId === undefined) {
        try { windowId = (await orig.get(ids[0])).windowId; } catch (e) {}
      }
      return mutate(s => {
        let gid = options.groupId;
        if (gid === undefined || !s.groups[gid]) {
          if (gid !== undefined) throw new Error(`No group with id: ${gid}.`);
          gid = newGroupId();
          s.groups[gid] = { id: gid, title: '', color: COLORS.GREY, collapsed: false, windowId: windowId ?? -1 };
        }
        for (const id of ids) s.members[id] = gid;
        dropEmptyGroups(s);
        return gid;
      });
    })();
    return withCallback(p, cb);
  };

  tabs.ungroup = function (tabIds, cb) {
    const ids = [].concat(tabIds ?? []);
    const p = mutate(s => {
      for (const id of ids) delete s.members[id];
      dropEmptyGroups(s);
    });
    return withCallback(p, cb);
  };

  // Tabs handed to event listeners carry groupId too.
  function wrapEvent(event, tabArgIndex) {
    if (!event?.addListener) return;
    const wrappers = new WeakMap();
    const add = event.addListener.bind(event);
    const remove = event.removeListener.bind(event);
    const has = event.hasListener.bind(event);
    event.addListener = (fn, ...rest) => {
      const w = (...args) => { annotate(args[tabArgIndex]); return fn(...args); };
      wrappers.set(fn, w);
      return add(w, ...rest);
    };
    event.removeListener = fn => remove(wrappers.get(fn) || fn);
    event.hasListener = fn => has(wrappers.get(fn) || fn);
  }
  wrapEvent(tabs.onUpdated, 2);
  wrapEvent(tabs.onCreated, 0);

  tabs.onRemoved.addListener(tabId => {
    if (state.members[tabId] === undefined) return;
    mutate(s => { delete s.members[tabId]; dropEmptyGroups(s); });
  });

  // ─── chrome.tabGroups ───

  const stubEvent = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; } });

  const tabGroups = {
    TAB_GROUP_ID_NONE: NONE,
    Color: COLORS,

    get(groupId, cb) {
      const p = ready.then(() => {
        const g = state.groups[groupId];
        if (!g) throw new Error(`No group with id: ${groupId}.`);
        return { ...g };
      });
      return withCallback(p, cb);
    },

    query(queryInfo = {}, cb) {
      const p = ready.then(() => Object.values(state.groups)
        .filter(g => Object.entries(queryInfo || {}).every(([k, v]) =>
          k === 'windowId' && v === -2 ? true : g[k] === v))
        .map(g => ({ ...g })));
      return withCallback(p, cb);
    },

    update(groupId, props = {}, cb) {
      const p = mutate(s => {
        const g = s.groups[groupId];
        if (!g) throw new Error(`No group with id: ${groupId}.`);
        for (const k of ['title', 'color', 'collapsed']) {
          if (props[k] !== undefined) g[k] = props[k];
        }
        return { ...g };
      });
      return withCallback(p, cb);
    },

    move(groupId, props = {}, cb) {
      const p = mutate(s => {
        const g = s.groups[groupId];
        if (!g) throw new Error(`No group with id: ${groupId}.`);
        if (props.windowId !== undefined) g.windowId = props.windowId;
        return { ...g };
      });
      return withCallback(p, cb);
    },

    onCreated: stubEvent(),
    onUpdated: stubEvent(),
    onRemoved: stubEvent(),
    onMoved: stubEvent()
  };

  try {
    Object.defineProperty(chrome, 'tabGroups', { value: tabGroups, configurable: true, writable: true });
  } catch (e) {
    chrome.tabGroups = tabGroups;
  }
})();
