// Price finder: people and hours in, a price out. Invalid input gives null (and an empty string on the page), never NaN.
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./vendor/quote.js") : root.WanderQuote);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WanderFinder = api;
})(typeof self !== "undefined" ? self : this, function (Quote) {
  // Whole number from a number or a numeric string within min..max, else null.
  function whole(v, min, max) {
    let n = v;
    if (typeof v === "string") {
      if (!/^\s*\d+\s*$/.test(v)) return null;
      n = Number(v);
    }
    return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
  }
  // The one place input is validated: {people, hours} as numbers, or null.
  function parse(people, hours) {
    const p = whole(people, 1, 500), h = whole(hours, 2, 6);
    return p === null || h === null ? null : { people: p, hours: h };
  }
  function priceFor(people, hours) {
    const v = parse(people, hours);
    if (v === null || !Quote || typeof Quote.quote !== "function") return null;
    const price = Quote.quote(v.people, v.hours);
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  }
  function format(price) {
    return "$" + Number(price).toLocaleString("en-AU");
  }
  // The per-head line under the price: the price per head only. What a head gets is listed once, in "What you get" (or the
  // Events island's "Every booking" line), so it is not repeated here. Empty for invalid input.
  function headLine(people, hours) {
    const v = parse(people, hours), price = priceFor(people, hours);
    if (v === null || price === null) return "";
    return "$" + Math.round(price / v.people).toLocaleString("en-AU") + " a head.";
  }
  // What the price is made of, split with the rate card itself (quote.js): quote(0, h) is the crew side, (h + 1) x $68.41 for the barista, van and
  // set-up; the rest is drinks and bowls. Both parts are whole dollars and add back to the price exactly. Null for invalid input.
  function parts(people, hours) {
    const v = parse(people, hours), price = priceFor(people, hours);
    if (v === null || price === null) return null;
    const crew = Quote.quote(0, v.hours);
    return { people: v.people, hours: v.hours, price: price, crew: crew, cups: price - crew };
  }
  function money2(n) { return "$" + Number(n).toFixed(2); }
  // The breakdown under the price. a: { bowl, drink, wage, minutes, drinks } as numbers (build.py reads them from menu.json and one sourced block).
  // kind "office": what the morning is worth (every line shows its basis, and the team-time line is the only assumption).
  // kind "event": only where the price goes, with no worth figure (guests at a party are not on paid time).
  // Pure: build.py renders the JS-off copy by calling this same function, so the two can never drift apart.
  function valueData(people, hours, a, kind) {
    const p = parts(people, hours);
    if (p === null || !a) return null;
    const bowl = Number(a.bowl), drink = Number(a.drink), wage = Number(a.wage), minutes = Number(a.minutes), drinks = Number(a.drinks);
    if (![bowl, drink].every(function (n) { return isFinite(n) && n > 0; })) return null;
    if (kind === "event") {
      return { kind: "event", title: "Where your " + format(p.price) + " goes",
        rows: [{ text: "Unlimited coffee, tea and hot chocolate, plus a breakfast bowl for all " + p.people, amount: p.cups },
               { text: "Barista, van and set-up: " + (p.hours + 1) + " hours (" + p.hours + " pouring, 1 set-up)", amount: p.crew }],
        total: { text: "Your price", amount: p.price }, foot: "All five guarantees, free babyccinos for under 12s included." };
    }
    if (![wage, minutes, drinks].every(function (n) { return isFinite(n) && n > 0; })) return null;
    const rows = [
      { text: "A barista and van for " + (p.hours + 1) + " hours (" + p.hours + " pouring, 1 set-up)", amount: p.crew },
      { text: p.people + " breakfast bowls at " + money2(bowl), amount: Math.round(p.people * bowl) },
      { text: drinks + " drinks each at " + money2(drink) + " (yours are unlimited)", amount: Math.round(p.people * drinks * drink) },
      { text: p.people + " people not queuing at a café: " + minutes + " minutes each at " + money2(wage) + " an hour", amount: Math.round(p.people * minutes / 60 * wage) },
    ];
    const worth = rows.reduce(function (t, r) { return t + r.amount; }, 0);
    return { kind: "office", title: "What's in your " + format(p.price) + "?", rows: rows, worth: worth, price: p.price,
      foot: "The hourly figure is the ABS average for full-time adults, May 2026. Change the people and hours above for yours." };
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function valueHtml(people, hours, a, kind) {
    const d = valueData(people, hours, a, kind);
    if (d === null) return "";
    const li = d.rows.map(function (r) { return "<li><span>" + esc(r.text) + "</span><b>" + format(r.amount) + "</b></li>"; }).join("");
    const total = d.kind === "office"
      ? '<p class="value-total">Worth about <b>' + format(d.worth) + "</b>. Yours for <b>" + format(d.price) + "</b>.</p>"
      : '<p class="value-total">' + esc(d.total.text) + ": <b>" + format(d.total.amount) + "</b></p>";
    return "<h2>" + esc(d.title) + '</h2><ul class="value-list">' + li + "</ul>" + total + '<p class="value-foot">' + esc(d.foot) + "</p>";
  }
  // The optional photographer, sold per hour for the whole morning. rate is whole dollars an hour, GST included, from config.js; empty means
  // the option does not exist, so nothing is shown and nothing is promised.
  function photoRate(v) { const n = typeof v === "string" ? (/^\s*\d{1,4}\s*$/.test(v) ? Number(v) : NaN) : v; return Number.isInteger(n) && n > 0 && n <= 1000 ? n : null; }
  function photoPrice(hours, rate) { const r = photoRate(rate), h = whole(hours, 2, 6); return r === null || h === null ? null : r * h; }
  function photoHtml(hours, rate) {
    const r = photoRate(rate), price = photoPrice(hours, rate);
    if (r === null || price === null) return "";
    return '<label class="photo-opt"><input type="checkbox" data-photo> <span>Add a photographer for the whole morning <b data-photo-price>+' + format(price) + "</b></span></label>" +
      '<small class="photo-note">Photos of your morning. We confirm the details when we ring you.</small>';
  }
  // Wires the inputs inside root. Hours can be a select or a radio group; the checked radio wins.
  function mount(root, onUse, extras) {
    if (!root || typeof root.querySelector !== "function") return null;
    const peopleEl = root.querySelector("[data-finder-people]");
    const hoursEls = Array.from(root.querySelectorAll("[data-finder-hours]"));
    const priceEl = root.querySelector("[data-finder-price]");
    const headEl = root.querySelector("[data-finder-head]");
    const valueEl = extras && extras.valueEl ? extras.valueEl : null, photoEl = extras && extras.photoEl ? extras.photoEl : null;
    function attr(el, k) { return el && typeof el.getAttribute === "function" ? el.getAttribute(k) : null; }
    const noteEl = root.querySelector("[data-finder-photo-note]");
    const photoBox = photoEl && typeof photoEl.querySelector === "function" ? photoEl.querySelector("[data-photo]") : null;
    if (!peopleEl || !hoursEls.length || !priceEl) return null;
    let timer = null, lastKey = null;
    function hoursValue() {
      const radios = hoursEls.filter(function (el) { return el.type === "radio"; });
      if (radios.length) { const on = radios.find(function (el) { return el.checked; }); return on ? on.value : ""; }
      return hoursEls[0].value;
    }
    // Renders the price. Only a real input or change event (report true) may arm the onUse timer.
    function render(report) {
      const v = parse(peopleEl.value, hoursValue());
      const price = v === null ? null : priceFor(v.people, v.hours);
      // The price tag is the whole price: with the photographer ticked it includes the photographer, and says so.
      const photoCost = v !== null && photoBox && photoBox.checked ? photoPrice(v.hours, attr(photoEl, "data-rate")) : null;
      priceEl.textContent = price === null ? "" : format(photoCost === null ? price : price + photoCost);
      if (noteEl) noteEl.textContent = price === null || photoCost === null ? "" : "with a " + v.hours + "-hour photographer (" + format(photoCost) + ")";
      if (headEl) headEl.textContent = v === null ? "" : headLine(v.people, v.hours);
      if (valueEl) valueEl.innerHTML = v === null ? "" : valueHtml(v.people, v.hours, { bowl: attr(valueEl, "data-bowl"), drink: attr(valueEl, "data-drink"), wage: attr(valueEl, "data-wage"), minutes: attr(valueEl, "data-minutes"), drinks: attr(valueEl, "data-drinks") }, attr(valueEl, "data-kind") || "office");
      if (photoEl) { const pr = photoEl.querySelector("[data-photo-price]"), pp = v === null ? null : photoPrice(v.hours, attr(photoEl, "data-rate")); if (pr) pr.textContent = pp === null ? "" : "+" + format(pp); }
      if (timer) { clearTimeout(timer); timer = null; }
      if (!report || price === null || typeof onUse !== "function") return;
      const info = { people: v.people, hours: v.hours, price: price };
      const key = info.people + "x" + info.hours;
      if (key === lastKey) return;
      timer = setTimeout(function () { timer = null; lastKey = key; onUse(info); }, 800);
    }
    function onEvent() { render(true); }
    root.addEventListener("input", onEvent);
    root.addEventListener("change", onEvent);
    // The photographer box sits outside the finder, so it is listened to on its own. Ticking it re-prices; it is not a new people-and-hours use.
    if (photoBox && typeof photoBox.addEventListener === "function") photoBox.addEventListener("change", function () { render(false); });
    render(false);
    return onEvent;
  }
  return { priceFor: priceFor, format: format, headLine: headLine, parts: parts, valueData: valueData, valueHtml: valueHtml, photoRate: photoRate, photoPrice: photoPrice, photoHtml: photoHtml, mount: mount };
});
