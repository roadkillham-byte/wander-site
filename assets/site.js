// Wander Home glue. Keeps the first utm tag for 90 days (wander-booking's source.js), carries it on Square and booking links
// (the booking links also take the price finder's people and hours),
// builds the one page-wide data layer (window.wanderLayer) and pushes the site's events into it, forwards the known ones to the
// first-party tracker (inert unless config.js sets the events URL), runs /q/ redirects through the allowlist, and fills the
// "today" strip from /today.json. With Do Not Track or Global Privacy Control on, nothing is sent and nothing is stored.
// Every part fails quietly: the links always work.
// The injected review link, as a pure function so node can test it. Every data-go anchor names its door; a Google review is
// closest to "social".
function reviewLinkHtml(url) {
  return '<a class="btn ghost" data-go data-door="social" href="' + String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '">Leave a review</a>';
}
// Which data layer event a click on a data-go link is, as a pure function of {href, dataset, textContent}. Only the destination's
// host (or an internal path, or the scheme of a tel: link) is reported, never the query string or a phone number.
var SOCIAL_HOSTS = { 'instagram.com': 'instagram', 'tiktok.com': 'tiktok', 'facebook.com': 'facebook', 'linkedin.com': 'linkedin', 'x.com': 'x', 'youtube.com': 'youtube' };
function eventForLink(el) {
  if (!el || !el.href) return null;
  var href = String(el.href), door = String((el.dataset && el.dataset.door) || ''), text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
  var to, host = '';
  if (/^tel:/i.test(href)) to = 'tel';
  else if (href.charAt(0) === '/') to = href.split(/[?#]/)[0];
  else {
    var m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(href); host = m ? m[1].toLowerCase().replace(/^www\./, '') : ''; to = host;
    // A real anchor's href is always absolute, so a link to this same site would report the site's own hostname. Report its path
    // instead. (No `location` in node, where the host is reported as before.)
    var here = (typeof location !== 'undefined' && location && location.hostname) ? String(location.hostname).toLowerCase().replace(/^www\./, '') : '';
    if (host && here && host === here) to = (href.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0]) || '/';
  }
  if (host === 'wa.me') {
    var dec = href.replace(/\+/g, ' '); try { dec = decodeURIComponent(dec); } catch (e) {}
    var r = /\(ref:\s*([A-Za-z0-9_-]{1,40})\s*\)/.exec(dec);
    return { name: 'whatsapp_click', data: { ref: r ? r[1].toLowerCase() : 'none' } };
  }
  if (door === 'social' || SOCIAL_HOSTS[host]) {
    var o = { to: to.slice(0, 40) }; if (SOCIAL_HOSTS[host]) o.social = SOCIAL_HOSTS[host];
    return { name: 'outbound_click', data: o };
  }
  return { name: 'cta_click', data: { door: door, label: (text || String((el.dataset && el.dataset.label) || '')).slice(0, 40), to: to.slice(0, 40) } };
}
// The privacy check used when datalayer.js is blocked. It must honour exactly what WanderDataLayer.suppressed honours.
function quietSignal(nav) {
  if (!nav) return false;
  var dnt = nav.doNotTrack;
  return dnt === '1' || dnt === 'yes' || dnt === true || nav.globalPrivacyControl === true;
}
// Tags go only where they are read: the Square site (WANDER_LINKS.order and .menu) and the booking page (.book). Any other link
// (WhatsApp, socials, maps, phone, a lookalike host) comes back as the very same string, so a pre-filled WhatsApp message is never
// re-encoded. Booking links also carry the finder's people and hours (whole numbers only) so the booking page can start there.
// o: { tag: {source, medium, campaign}, content, links: window.WANDER_LINKS, finder: {people, hours} or null, photo: hours of the optional photographer, or 0, door: the link's data-door }.
var TAG_KEYS = ['order', 'menu', 'book', 'refer'];
function isWholeCount(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n > 0; }
function tagUrl(href, o) {
  o = o || {};
  var links = o.links || {}, kind = '', u;
  if (!/^https:\/\//i.test(String(href))) return href;
  try { u = new URL(String(href)); } catch (e) { return href; }
  for (var i = 0; i < TAG_KEYS.length && !kind; i++) {
    var t = null; try { t = links[TAG_KEYS[i]] ? new URL(links[TAG_KEYS[i]]) : null; } catch (e) {}
    if (t && t.protocol === 'https:' && u.host === t.host && u.pathname.indexOf(t.pathname) === 0) kind = TAG_KEYS[i];
  }
  if (!kind) return href;
  var add = [], tag = o.tag, f = o.finder;
  if (tag && tag.source) { add.push(['utm_source', tag.source]); if (tag.medium) add.push(['utm_medium', tag.medium]); if (tag.campaign) add.push(['utm_campaign', tag.campaign]); }
  var c = o.content ? String(o.content).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : '';
  if (c) add.push(['utm_content', c]);
  if (kind === 'book' && f && isWholeCount(f.people) && isWholeCount(f.hours)) { add.push(['people', String(f.people)]); add.push(['hours', String(f.hours)]); }
  if (kind === 'book' && isWholeCount(o.photo)) add.push(['photo', String(o.photo)]);
  if (kind === 'book' && /^[a-z0-9_-]{1,20}$/.test(String(o.door || ''))) add.push(['from', String(o.door)]);
  if (!add.length) return href;
  add.forEach(function (p) { u.searchParams.set(p[0], p[1]); });
  return u.toString();
}
// The finder's current numbers, read straight from its inputs (not from the data layer, which is off under Do Not Track and
// waits 800 ms), as {people, hours}, or null when there is no finder, no finder.js, or the input is not something
// WanderFinder.priceFor can price. Hours can be radios (the checked one) or a select, as in finder.js.
function finderState(root, Finder) {
  try {
    if (!root || !Finder || typeof Finder.priceFor !== 'function') return null;
    var p = root.querySelector('[data-finder-people]'), hs = Array.prototype.slice.call(root.querySelectorAll('[data-finder-hours]') || []);
    if (!p || !hs.length) return null;
    var radios = hs.filter(function (el) { return el.type === 'radio'; }), on = radios.filter(function (el) { return el.checked; })[0];
    var pv = String(p.value == null ? '' : p.value).trim(), hv = String(radios.length ? (on ? on.value : '') : hs[0].value).trim();
    if (Finder.priceFor(pv, hv) === null) return null;
    return { people: Number(pv), hours: Number(hv) };
  } catch (e) { return null; }
}
// A preview build served from a subpath (build.py with WANDER_BASE) marks <html data-base="/wander-site">; '' everywhere else.
// Only a plain /segment path is trusted, so the value can never point a fetch at another host.
function siteBase(el) {
  var b = ''; try { b = (el && el.getAttribute && el.getAttribute('data-base')) || ''; } catch (e) {}
  return /^(\/(?!\.+(\/|$))[A-Za-z0-9._-]+)+$/.test(String(b)) ? String(b) : '';
}
// The site's interaction events as the tracker's one generic event: {n: name, a, b: short labels, v: a number}. Names only, never text a visitor typed.
// null for anything else. Pure, so node can test it. Until the Apps Script knows the `ev` type it drops these quietly.
function namedEvent(name, d) {
  d = d || {};
  var s = function (v) { return String(v === undefined || v === null ? '' : v).slice(0, 40); };
  switch (name) {
    case 'section_view': return { n: name, a: s(d.name) };
    case 'photo_choice': return { n: name, a: d.on ? 'on' : 'off', v: Number(d.hours) || 0 };
    case 'nav_click': return { n: name, a: s(d.to) };
    case 'js_error': return { n: name, a: s(d.file) };
    case 'island_expand': case 'island_collapse': return { n: name, a: s(d.island), b: s(d.via) };
    case 'island_dwell': return { n: name, a: s(d.island), v: Number(d.seconds) || 0 };
    case 'faq_open': return { n: name, v: Number(d.question) || 0 };
    case 'faq_ask': return { n: name, a: s(d.page) };
    default: return null;
  }
}
var WanderSite = { namedEvent: namedEvent, reviewLinkHtml: reviewLinkHtml, eventForLink: eventForLink, quietSignal: quietSignal, tagUrl: tagUrl, finderState: finderState, siteBase: siteBase };
if (typeof module === 'object' && module.exports) module.exports = WanderSite;
if (typeof window !== 'undefined') (function () {
  // A privacy signal (Do Not Track or Global Privacy Control) means nothing is sent and nothing is stored: no storage handle at all.
  var quiet = false; try { quiet = window.WanderDataLayer ? window.WanderDataLayer.suppressed(navigator) : quietSignal(navigator); } catch (e) { quiet = true; }
  var store = null; if (!quiet) { try { store = window.localStorage; } catch (e) {} }
  var tag = null;
  try { tag = window.WanderSource.captureSource(location.search, store, Date.now()); } catch (e) {}
  // '' normally; '/wander-site' in a preview build. Paths below are compared and fetched under it.
  var BASE = ''; try { BASE = siteBase(document.documentElement); } catch (e) {}
  var here = String(location.pathname || ''); if (BASE && here.indexOf(BASE + '/') === 0) here = here.slice(BASE.length);
  if (window.WANDER_QR) tag = { source: 'qr', medium: 'print', campaign: window.WANDER_QR };
  else if (!tag && here.indexOf('/links/') === 0) tag = { source: 'instagram', medium: 'bio', campaign: '' };
  var content = new URLSearchParams(location.search).get('utm_content');
  function tagged(href, finder, photo, door) {
    try { return tagUrl(href, { tag: tag, content: content, links: window.WANDER_LINKS, finder: finder || null, photo: photo || 0, door: door || '' }); } catch (e) { return href; }
  }
  // The first-party tracker. Not even built under a privacy signal (building it writes a visitor id to storage).
  var tracker = null; if (!quiet) { try { tracker = window.WanderBoot.tracker(); } catch (e) {} }
  var startedAt = Date.now(), maxScroll = 0, dwellStart = {};
  // Only these data layer events reach the tracker, mapped onto its existing contract (view, click, scroll, leave, calc).
  // Everything else (islands, faq, qr dwell...) stays in the data layer until the Apps Script sanitiser learns it.
  function forward(name, d) {
    if (!tracker || !tracker.enabled) return;
    try {
      if (name === 'page_view') tracker.track('view', tracker.viewData({ search: location.search, referrer: document.referrer, path: location.pathname, lang: navigator.language,
        tzo: -new Date().getTimezoneOffset(), hour: new Date().getHours(), width: window.innerWidth, coarse: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) }));
      else if (name === 'cta_click') { tracker.track('click', { to: d.to, r: d.door }); tracker.flush(); }
      else if (name === 'outbound_click') { tracker.track('click', { to: d.to, r: d.social }); tracker.flush(); }
      else if (name === 'whatsapp_click') { tracker.track('click', { to: 'wa.me', r: d.ref }); tracker.flush(); }
      else if (name === 'qr_scan') { tracker.track('click', { to: 'qr_' + d.code, r: 'qr' }); tracker.flush(); }
      else if (name === 'scroll_depth') tracker.track('scroll', { pct: d.pct });
      else if (name === 'finder_use') tracker.track('calc', { p: d.people, h: d.hours });
      else if (name === 'time_on_page') { tracker.track('leave', { act: d.seconds, max: maxScroll }); tracker.flush(); }
      else { var ev = namedEvent(name, d); if (ev) tracker.track('ev', ev); }
    } catch (e) {}
  }
  // The one page-wide layer. islands.js and the offices finder push into it through window.wanderLayer.
  var layer = null;
  try {
    if (window.wanderLayer) layer = window.wanderLayer;
    else if (window.WanderDataLayer) layer = window.wanderLayer = window.WanderDataLayer.create({ respect: window.WanderDataLayer.suppressed(navigator), forward: function (name, d) { track(name, d); forward(name, d); } });
  } catch (e) {}
  function push(name, data) { try { if (layer) layer.push(name, data); } catch (e) {} }
  // Island dwell: time between an expand and the matching collapse (or leaving the page). Reads islands.js's own events as they
  // pass through the layer, so there is no second listener on the islands. Under a second is a hover flick and is skipped.
  function track(name, d) {
    if (name === 'island_expand') dwellStart[d.island] = Date.now();
    else if (name === 'island_collapse') endDwell(d.island);
  }
  function endDwell(island) {
    var t0 = dwellStart[island]; delete dwellStart[island];
    var sec = t0 ? Math.round((Date.now() - t0) / 1000) : 0;
    if (sec >= 1) push('island_dwell', { island: island, seconds: sec });
  }
  if (layer && layer.enabled) {
    push('page_view', { path: location.pathname, source: tag && tag.source || '', medium: tag && tag.medium || '', campaign: tag && tag.campaign || '',
      content: content ? content.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) : '', qr: window.WANDER_QR || '' });
    if (window.WANDER_QR) push('qr_scan', { code: window.WANDER_QR });
  }
  // Square and booking links get the visit's tags, and booking links the finder's numbers; every other link stays as built.
  // Re-applied whenever the finder changes, so a booking link always carries what the visitor last saw priced (invalid input:
  // no numbers). The numbers are the visitor's own, going to the page they chose, not tracking, so this runs under DNT too.
  var finderRoot = null; try { finderRoot = document.querySelector('[data-finder]'); } catch (e) {}
  var goLinks = [];
  try { Array.prototype.forEach.call(document.querySelectorAll('a[data-go]'), function (a) { var h = a.getAttribute('href'); if (/^https:/.test(h || '')) goLinks.push([a, h]); }); } catch (e) {}
  function relink() {
    var f = finderState(finderRoot, window.WanderFinder), pc = null; try { pc = document.querySelector('[data-photo]'); } catch (e) {}
    var photo = pc && pc.checked && f ? f.hours : 0;
    goLinks.forEach(function (p) { try { var next = tagged(p[1], f, photo, p[0].getAttribute('data-door')); if (p[0].getAttribute('href') !== next) p[0].setAttribute('href', next); } catch (e) {} });
  }
  relink();
  if (finderRoot) { document.addEventListener('input', relink); document.addEventListener('change', relink); }
  // One delegated listener for every tracked link (anchors added later are covered too).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[data-go]'); if (!a) return;
    var ev = eventForLink(a); if (ev) push(ev.name, ev.data);
  });
  // FAQ opens: the toggle event does not bubble, so listen in the capture phase. Each question is reported once.
  var faqSeen = {};
  // Question collector: a visitor types a question and WhatsApp opens with it filled in (ref: faq-<page>), so questions land with Sam and can
  // be tallied (see the Questions Log note). The data layer only ever gets the page name, never the text.
  Array.prototype.forEach.call(document.querySelectorAll('form[data-ask]'), function (f) {
    f.hidden = false;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = f.querySelector('textarea'), q = (box.value || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!q) { box.focus(); return; }
      var ref = f.getAttribute('data-ask') || 'faq';
      push('faq_ask', { page: ref });
      var base = (window.WANDER_LINKS && window.WANDER_LINKS.whatsapp) || 'https://wa.me/61492801058';
      var url = base + '?text=' + encodeURIComponent('Hi Wander, a question: ' + q + ' (ref: faq-' + ref + ')');
      var a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      box.value = '';
    });
  });
  document.addEventListener('toggle', function (e) {
    var d = e.target; if (!d || d.tagName !== 'DETAILS' || !d.open) return;
    var idx = Array.prototype.indexOf.call(document.querySelectorAll('details'), d);
    if (idx < 0 || faqSeen[idx]) return; faqSeen[idx] = true;
    push('faq_open', { question: idx });
  }, true);
  // Section views: an element marked data-view="name" reports once, when half of it has been on screen (the breakdown, the Office Club, the
  // photographer option). Only the name is reported. Interest in the photographer is reported when the box is ticked or cleared, with the hours.
  if (layer && layer.enabled && window.IntersectionObserver) {
    try {
      var seen = new window.IntersectionObserver(function (list) { list.forEach(function (en) { if (!en.isIntersecting) return; var n = en.target.getAttribute('data-view'); seen.unobserve(en.target); push('section_view', { name: String(n || '').slice(0, 30) }); }); }, { threshold: 0.5 });
      Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (el) { seen.observe(el); });
    } catch (e) {}
  }
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.hasAttribute || !t.hasAttribute('data-photo')) return;
    var f = finderState(finderRoot, window.WanderFinder); push('photo_choice', { on: !!t.checked, hours: f ? f.hours : 0 });
  });
  // Menu taps (where the visitor goes next) and script errors (the file name only), so a broken page shows up in the numbers.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('header nav a'); if (!a) return;
    push('nav_click', { to: String(a.getAttribute('href') || '').split(/[?#]/)[0].slice(0, 40) });
  });
  window.addEventListener('error', function (e) { push('js_error', { file: String((e && e.filename) || '').split('/').pop().split('?')[0].slice(0, 40) }); });
  // Scroll depth: 25, 50, 75 and 100 per cent of the page, each once. Passive listener, one check per frame.
  var scrollMarks = [25, 50, 75, 100], scrollQueued = false;
  function checkScroll() {
    scrollQueued = false;
    var el = document.documentElement, total = Math.max(el.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (!total) return;
    var pct = Math.min(100, Math.round(((window.pageYOffset || el.scrollTop || 0) + window.innerHeight) / total * 100));
    if (pct > maxScroll) maxScroll = pct;
    scrollMarks = scrollMarks.filter(function (m) { if (pct < m) return true; push('scroll_depth', { pct: m }); return false; });
  }
  if (layer && layer.enabled) {
    window.addEventListener('scroll', function () { if (scrollQueued || !scrollMarks.length) return; scrollQueued = true; if (window.requestAnimationFrame) window.requestAnimationFrame(checkScroll); else setTimeout(checkScroll, 16); }, { passive: true });
    window.addEventListener('load', checkScroll);
    checkScroll();
  }
  // Leaving: close any open island's dwell, then report the time on the page once. pagehide is the usual signal; visibilitychange
  // (hidden) is the fallback for browsers that skip pagehide (mobile tab switches and kills). Whichever comes first reports; the
  // other is ignored. A back/forward cache restore (pageshow, persisted) is a new page view and may report once more.
  var left = false;
  function leave() {
    if (left) return; left = true;
    Object.keys(dwellStart).forEach(endDwell);
    push('time_on_page', { seconds: Math.min(1800, Math.round((Date.now() - startedAt) / 1000)) });
    try { if (tracker && tracker.enabled) tracker.flush(); } catch (e) {}
  }
  window.addEventListener('pagehide', leave, { passive: true });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); });
  window.addEventListener('pageshow', function (e) { if (e && e.persisted && left) { left = false; startedAt = Date.now(); maxScroll = 0; } }, { passive: true });
  // A blocked or broken links.js must not stop the today strip or the loaders below.
  if (window.WANDER_QR_KEY) {
    try {
      var dest = window.WanderLinks.resolveLink(window.WANDER_QR_KEY, window.WANDER_LINKS);
      if (dest) setTimeout(function () { location.replace(tagged(dest)); }, 120);
    } catch (e) {}
  }
  var strips = document.querySelectorAll('#today-strip');
  if (strips.length) fetch(BASE + '/today.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (t) {
    var d = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }), fresh = t.date === d, s = t.special || {};
    var txt = (fresh ? 'Today: ' : 'Usually: ') + t.spot + ' · ' + t.hours + (fresh && s.name ? ' · Special: ' + s.name + (s.price ? ' $' + s.price : '') : '') + (fresh && t.note ? ' · ' + t.note : '');
    // A data-fresh-only strip (the hub's Order island) shows only today's real news; its stale fallback would repeat the island's text.
    strips.forEach(function (el) { if (!fresh && el.hasAttribute && el.hasAttribute('data-fresh-only')) return; el.textContent = txt; el.hidden = false; });
    var ev = document.getElementById('events'), up = (t.events || []).filter(function (e) { return e.date >= d; });
    if (ev && up.length) { var ul = document.createElement('ul'); up.forEach(function (e) { var li = document.createElement('li'); li.textContent = e.date + ': ' + e.name + ', ' + e.where; ul.appendChild(li); }); var h = document.createElement('h2'); h.textContent = 'Coming up'; ev.appendChild(h); ev.appendChild(ul); }
  }).catch(function () {});
  // Optional loaders: only when an ID is set and Do Not Track / Global Privacy Control is off.
  var dnt = quiet;
  function load(src, attrs) { var sc = document.createElement('script'); sc.async = true; sc.src = src; Object.keys(attrs || {}).forEach(function (k) { sc.setAttribute(k, attrs[k]); }); document.head.appendChild(sc); }
  if (!dnt && window.CF_BEACON_TOKEN) load('https://static.cloudflareinsights.com/beacon.min.js', { 'data-cf-beacon': JSON.stringify({ token: window.CF_BEACON_TOKEN }) });
  if (!dnt && window.GA4_ID) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', window.GA4_ID); load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(window.GA4_ID)); }
  if (!dnt && window.META_PIXEL_ID) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', window.META_PIXEL_ID); window.fbq('track', 'PageView');
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[data-go]'); if (!a || !window.fbq) return; var h = a.href || ''; if (/wa\.me|wander-booking/.test(h)) window.fbq('track', 'Lead'); else if (/square\.site/.test(h)) window.fbq('track', 'InitiateCheckout'); });
  }
  var rv = document.getElementById('review-slot');
  if (rv && window.WANDER_REVIEW_URL) rv.innerHTML = reviewLinkHtml(window.WANDER_REVIEW_URL);
})();
