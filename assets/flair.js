/* Wander flair: the top-bar "open" pill and the depth on button hovers. No network, no tracking, nothing stored. */
(function (root) {
  'use strict';
  var OPEN = 7 * 60, CLOSE = 14 * 60;   // the posted hours: 7am to 2pm, Saturday and Sunday (Sydney time)
  function sydneyParts(d) {
    var h = 0, m = 0, wd = '';
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d).forEach(function (p) {
      if (p.type === 'hour') h = +p.value % 24; else if (p.type === 'minute') m = +p.value; else if (p.type === 'weekday') wd = p.value;
    });
    return { minutes: h * 60 + m, weekend: wd === 'Sat' || wd === 'Sun', sunday: wd === 'Sun' };
  }
  // The pill follows the posted hours (weekends only: weekdays are not promised), not whether the van is actually trading today.
  function status(d) {
    var t = sydneyParts(d), m = t.minutes;
    if (!t.weekend) return { state: 'closed', text: 'Back Saturday, 7am' };
    if (m >= OPEN && m < CLOSE) return { state: 'open', text: 'Open now, till 2pm' };
    if (m < OPEN) return { state: 'closed', text: 'Opens at 7am' };
    return { state: 'closed', text: t.sunday ? 'Back Saturday, 7am' : 'Back at 7am tomorrow' };
  }
  function pill(doc) {
    var els = doc.querySelectorAll('[data-open]');
    if (!els.length) return;
    function paint() { var s; try { s = status(new Date()); } catch (e) { return; } for (var i = 0; i < els.length; i++) { els[i].textContent = s.text; els[i].setAttribute('data-state', s.state); } }
    paint(); setInterval(paint, 60000);
  }
  // Each button label gets a span, so the label can drift a little against the button when it tilts.
  function wrap(doc) {
    var list = doc.querySelectorAll('.btn');
    for (var i = 0; i < list.length; i++) {
      var b = list[i], f = b.firstElementChild;
      if (f && f.className === 'btn-t') continue;
      var s = doc.createElement('span'); s.className = 'btn-t';
      while (b.firstChild) s.appendChild(b.firstChild);
      b.appendChild(s);
    }
  }
  var VARS = ['--rx', '--ry', '--tx', '--ty', '--sx', '--dy', '--mx', '--my'];
  function tilt(win, doc) {
    var mq = win.matchMedia;
    if (!mq || !mq('(hover:hover) and (pointer:fine)').matches || mq('(prefers-reduced-motion:reduce)').matches) return;
    var cur = null, last = null, queued = false;
    function reset(b) { if (b) VARS.forEach(function (v) { b.style.removeProperty(v); }); }
    function paint() {
      queued = false;
      if (!cur || !last) return;
      var r = cur.getBoundingClientRect(); if (!r.width || !r.height) return;
      var nx = Math.max(-1, Math.min(1, ((last.clientX - r.left) / r.width) * 2 - 1)), ny = Math.max(-1, Math.min(1, ((last.clientY - r.top) / r.height) * 2 - 1)), st = cur.style;
      st.setProperty('--rx', (-ny * 9).toFixed(1) + 'deg'); st.setProperty('--ry', (nx * 11).toFixed(1) + 'deg');
      st.setProperty('--tx', (nx * 4).toFixed(1) + 'px'); st.setProperty('--ty', (ny * 3).toFixed(1) + 'px');
      st.setProperty('--sx', (-nx * 5).toFixed(1) + 'px'); st.setProperty('--dy', (-ny * 2).toFixed(1) + 'px');
      st.setProperty('--mx', ((nx + 1) * 50).toFixed(0) + '%'); st.setProperty('--my', ((ny + 1) * 50).toFixed(0) + '%');
    }
    doc.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var b = e.target && e.target.closest ? e.target.closest('.btn') : null;
      if (cur && cur !== b) reset(cur);
      cur = b; last = e;
      if (b && !queued) { queued = true; (win.requestAnimationFrame || setTimeout)(paint); }
    }, { passive: true });
    win.addEventListener('blur', function () { reset(cur); cur = null; });
  }
  function init(win, doc) { try { pill(doc); wrap(doc); tilt(win, doc); } catch (e) {} }
  root.WanderFlair = { status: status, init: init };
  if (root.document && root.document.addEventListener) init(root, root.document);
})(typeof window !== 'undefined' ? window : this);
