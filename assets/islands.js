// Islands hub: Events, Offices (centre, the default) and Order grow on hover, keyboard focus or tap.
// next() is the pure state; mount() wires the page and is a no-op when already mounted. With JS off nothing here runs
// and the three islands stay stacked with everything visible.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.WanderIslands = api;
    if (typeof document !== "undefined") {
      const run = function () { api.mount(document.querySelector("section.islands")); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
    }
  }
})(typeof self !== "undefined" ? self : this, function () {
  const NAMES = ["events", "offices", "order"], HOME = 1;
  const valid = function (i) { return Number.isInteger(i) && i >= 0 && i < NAMES.length; };

  // On a coarse pointer (touch, or the stacked phone layout) only tap changes state, and tapping the open island closes it.
  // "open" (a link to the island, such as the hub's "Price my morning") always opens it and never collapses it.
  function next(state, ev) {
    const active = state && (state.active === null || valid(state.active)) ? state.active : HOME;
    const same = { active: active };
    if (!ev || typeof ev !== "object") return same;
    if (ev.type === "escape") return { active: null };
    if (ev.type === "leave") return ev.coarse ? same : { active: HOME };
    if (!valid(ev.index)) return same;
    if (ev.type === "open") return { active: ev.index };
    if (ev.type === "tap") return { active: ev.coarse && active === ev.index ? null : ev.index };
    if (ev.type === "enter" || ev.type === "focus") return ev.coarse ? same : { active: ev.index };
    return same;
  }

  // Founding hosts left, or null when none are left or the config is missing (never 0, negative or NaN).
  function founding(total, taken) {
    if (!Number.isInteger(total) || !Number.isInteger(taken) || taken < 0) return null;
    const left = total - taken;
    return left > 0 ? { left: left, total: total } : null;
  }

  // The Founding hosts sentence in four parts (bold lead, body, "N places left" pill, tail), shared wording with the static line
  // build.py writes on /offices/ and /events/. null when no places are left.
  function foundingParts(f) {
    if (!f || !Number.isInteger(f.left) || f.left < 1 || !Number.isInteger(f.total)) return null;
    return ["Founding hosts:", " our first " + f.total + " bookings get a bonus hour free, in return for photos and a few kind words we can share. ",
      f.left + (f.left === 1 ? " place" : " places") + " left.", " We confirm your bonus hour when we ring you."];
  }
  function foundingLine(f) { const p = foundingParts(f); return p ? p.join("") : ""; }

  function mount(root) {
    if (!root || typeof root.querySelectorAll !== "function" || root.hasAttribute("data-live")) return null;
    const islands = Array.from(root.querySelectorAll("article[data-island]"));
    if (islands.length !== NAMES.length) return null;
    const doc = root.ownerDocument, win = doc.defaultView || {};
    const mq = function (q) { try { return !!win.matchMedia(q).matches; } catch (e) { return false; } };
    // Matches the CSS: the row layout starts at min-width 960px; anything else stacks as an accordion, where hover would shuffle
    // the stack. Asking "not wide" rather than "narrow" leaves no gap at fractional widths such as 959.5px.
    const narrow = function () { try { return !win.matchMedia("(min-width: 960px)").matches; } catch (e) { return false; } };
    let lastPointer = "";
    // Touch and pen, the stacked layout, or a device without hover all mean tap-only.
    function coarse(e) {
      const t = (e && e.pointerType) || lastPointer;
      if (t === "touch" || t === "pen" || narrow()) return true;
      if (t === "mouse" || t === "key") return false;
      return mq("(hover: none)");
    }
    let state = { active: HOME };
    // The heading becomes the toggle button, so aria-expanded sits on a control, not on the article.
    const toggles = islands.map(function (el, i) {
      const head = el.querySelector(".island-head"), more = el.querySelector(".island-more");
      if (!head) return null;
      const b = doc.createElement("button");
      b.type = "button"; b.className = "island-toggle";
      while (head.firstChild) b.appendChild(head.firstChild);
      const mark = doc.createElement("span"); mark.className = "island-mark"; mark.setAttribute("aria-hidden", "true");
      b.appendChild(mark);
      if (more && more.id) b.setAttribute("aria-controls", more.id);
      head.appendChild(b);
      b.addEventListener("click", function (e) { dispatch("tap", i, "tap", coarse(e)); });
      el.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !typing()) dispatch("enter", i, "hover", coarse(e)); });
      // Only focus arriving from outside the island counts; moving within it changes nothing.
      el.addEventListener("focusin", function (e) { if (!(e.relatedTarget && el.contains(e.relatedTarget))) dispatch("focus", i, "focus", coarse(null)); });
      return b;
    });
    // Keep the open island while someone is typing a number in it; hover elsewhere would hide the field they are in.
    // Radios are not typing: after a click on an hours pill, hover works as usual.
    function typing() {
      const a = doc.activeElement;
      return !!(a && a.tagName === "INPUT" && a.type === "number" && state.active !== null && islands[state.active].contains(a));
    }
    function render() {
      islands.forEach(function (el, i) {
        const on = state.active === i;
        if (on) el.setAttribute("data-active", ""); else el.removeAttribute("data-active");
        if (toggles[i]) toggles[i].setAttribute("aria-expanded", on ? "true" : "false");
      });
      if (state.active === null) root.removeAttribute("data-open"); else root.setAttribute("data-open", "");
      if (!root.hasAttribute("data-motion") || mq("(prefers-reduced-motion: reduce)")) hold();
    }
    // Row layout: the row never shrinks below its tallest settled height, so a shorter island opening cannot pull the
    // row out from under the pointer (which would flip hover back and forth). Measured only when widths have settled.
    let tallest = 0;
    function hold() {
      if (narrow()) { tallest = 0; root.style.minHeight = ""; return; }
      const h = Math.ceil(root.getBoundingClientRect().height);
      if (h > tallest) { tallest = h; root.style.minHeight = h + "px"; }
    }
    root.addEventListener("transitionend", function (e) { if (e.propertyName === "flex-grow" && e.target.hasAttribute("data-active")) hold(); });
    let resizeTimer = null;
    if (win.addEventListener) win.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { tallest = 0; root.style.minHeight = ""; hold(); }, 200);
    });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(hold, function () {});
    function push(name, i, via) {
      try { if (win.wanderLayer) win.wanderLayer.push(name, { island: NAMES[i], via: via }); } catch (e) {}
    }
    function dispatch(type, i, via, isCoarse) {
      const before = state.active;
      state = next(state, { type: type, index: i, coarse: isCoarse });
      if (state.active === before) return;
      render();
      if (before !== null) push("island_collapse", before, via);
      if (state.active !== null) push("island_expand", state.active, via);
    }
    doc.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType || ""; }, true);
    doc.addEventListener("keydown", function () { lastPointer = "key"; }, true);
    root.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !typing()) dispatch("leave", HOME, "hover", coarse(e)); });
    // Escape collapses (reported as via "focus": it is a keyboard action). Focus moves to the toggle first so it is not lost.
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || state.active === null) return;
      const t = toggles[state.active];
      if (t && islands[state.active].contains(doc.activeElement) && doc.activeElement !== t) t.focus();
      dispatch("escape", state.active, "focus", coarse(null));
    });
    // A link to the Offices island (the hub's sticky "Price my morning" sits outside this section, so listen on the document):
    // open Offices without the second-tap collapse, then bring its finder into view. The native jump is cancelled because it
    // would land the island's top under the sticky header. Without islands.js the link is a plain jump to #offices.
    const home = islands[HOME];
    if (home.id) doc.addEventListener("click", function (e) {
      const a = e.target && e.target.closest ? e.target.closest('a[href="#' + home.id + '"]') : null;
      if (!a) return;
      e.preventDefault();
      dispatch("open", HOME, "tap", coarse(e));
      const target = home.querySelector("[data-finder]") || home;
      try { target.scrollIntoView({ block: "center" }); } catch (err) { target.scrollIntoView(); }
    });

    // Founding hosts: shown only while real places are left in config.js.
    const slot = root.querySelector("[data-founding]");
    if (slot) {
      const f = founding(win.FOUNDING_HOSTS_TOTAL, win.FOUNDING_HOSTS_TAKEN);
      if (!f) slot.remove();
      else {
        const p = foundingParts(f), b = doc.createElement("b"), left = doc.createElement("span");
        b.textContent = p[0]; left.className = "founding-left"; left.textContent = p[2];
        slot.textContent = "";
        slot.append(b, p[1], left, p[3]);
        slot.hidden = false;
      }
    }
    // The price finder lives in the Offices island; mounted once (marked so a later caller can skip it).
    const finder = root.querySelector("[data-finder]");
    if (finder && !finder.hasAttribute("data-finder-live") && win.WanderFinder) {
      finder.setAttribute("data-finder-live", "");
      win.WanderFinder.mount(finder, function (info) {
        try { if (win.wanderLayer) win.wanderLayer.push("finder_use", info); } catch (e) {}
      });
    }
    root.setAttribute("data-live", "");
    render();
    // Transitions switch on after the first frame, so the jump from stacked to row at load is not animated.
    const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : function (f) { return setTimeout(f, 16); };
    raf(function () { raf(function () { root.setAttribute("data-motion", ""); }); });
    return { state: function () { return state.active; } };
  }

  return { next: next, founding: founding, foundingLine: foundingLine, mount: mount };
});
