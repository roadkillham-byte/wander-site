// Tiny event layer. When Do Not Track or Global Privacy Control is on, nothing is recorded, sent or stored.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WanderDataLayer = api;
})(typeof self !== "undefined" ? self : this, function () {
  const NAME = /^[a-z_]{2,30}$/, MAX_EVENTS = 200, MAX_STRING = 40;
  // True when the visitor has asked not to be tracked.
  function suppressed(nav) {
    if (!nav) return false;
    const dnt = nav.doNotTrack;
    return dnt === "1" || dnt === "yes" || dnt === true || nav.globalPrivacyControl === true;
  }
  // Keep only short primitives so no stray object or long free text can leave the page.
  function clean(data) {
    const out = {};
    if (!data || typeof data !== "object") return out;
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (typeof v === "string") out[k] = v.slice(0, MAX_STRING);
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    }
    return out;
  }
  // opts.respect true means a privacy signal is on: the layer is disabled and never touches forward or store.
  function create(opts) {
    const o = opts || {};
    const now = typeof o.now === "function" ? o.now : Date.now;
    const layer = { enabled: !o.respect, events: [], shouldRespect: suppressed };
    layer.push = function (name, data) {
      if (!layer.enabled || typeof name !== "string" || !NAME.test(name) || layer.events.length >= MAX_EVENTS) return false;
      const ev = { name, data: clean(data), t: now() };
      layer.events.push(ev);
      // A dataLayer-style array of events. Not GA4's window.dataLayer: GA4 would need a bridge, and none is built.
      if (typeof window !== "undefined") (window.wanderDataLayer = window.wanderDataLayer || []).push(ev);
      if (typeof o.forward === "function") o.forward(name, ev.data);
      return true;
    };
    return layer;
  }
  return { create, suppressed };
});
