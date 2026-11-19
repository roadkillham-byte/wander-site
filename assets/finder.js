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
  // The per-head line under the price: what one head gets for it. The bowl price comes from menu.json (rendered into data-bowl by
  // build.py), never typed here. Empty for invalid input or when there is no bowl price, so nothing half-true is shown.
  function headLine(people, hours, bowl) {
    const v = parse(people, hours), price = priceFor(people, hours);
    if (v === null || price === null || typeof bowl !== "string" || !bowl.trim()) return "";
    return "$" + Math.round(price / v.people).toLocaleString("en-AU") + " a head: unlimited coffee, tea and hot chocolate, a " + bowl.trim() + " breakfast bowl each, set-up included.";
  }
  // Wires the inputs inside root. Hours can be a select or a radio group; the checked radio wins.
  function mount(root, onUse) {
    if (!root || typeof root.querySelector !== "function") return null;
    const peopleEl = root.querySelector("[data-finder-people]");
    const hoursEls = Array.from(root.querySelectorAll("[data-finder-hours]"));
    const priceEl = root.querySelector("[data-finder-price]");
    const headEl = root.querySelector("[data-finder-head]");
    const bowl = headEl && typeof headEl.getAttribute === "function" ? headEl.getAttribute("data-bowl") : null;
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
      priceEl.textContent = price === null ? "" : format(price);
      if (headEl) headEl.textContent = v === null ? "" : headLine(v.people, v.hours, bowl);
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
    render(false);
    return onEvent;
  }
  return { priceFor: priceFor, format: format, headLine: headLine, mount: mount };
});
