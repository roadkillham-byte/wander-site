// Same public settings as wander-booking/config.js (nothing secret here). Tracking is first-party, honours Do Not Track, and is inert if these are blank.
window.WANDER_INTAKE_URL = "https://script.google.com/macros/s/AKfycbxdeorHui4vgW2oQXYC8bS4rmYHU_JXL_ARH6XizzqD8b3HzobVtB6ctgR-SFLpJfLeYw/exec";
window.WANDER_EVENTS_URL = window.WANDER_INTAKE_URL;
window.WANDER_SITE_KEY = "wander-site";
window.WANDER_RESPECT_DNT = true;
window.WANDER_EXPERIMENTS = {};
// Where tracked links (/q/<code>/ and data-go) may go. Nothing outside this list is ever reachable. Keep in step with links.json.
window.WANDER_LINKS = {
  order: "https://wander-109369.square.site/s/order",
  menu: "https://wander-109369.square.site/",
  book: "https://roadkillham-byte.github.io/wander-booking/",
  call: "tel:+61492801058",
  whatsapp: "https://wa.me/61492801058",
  refer: "https://wandercoffee.com.au/refer/"
};
// Each of these is inert while empty (Sam sets them; the Pixel and GA4 also need the privacy notice updated first, decision D4).
window.CF_BEACON_TOKEN = "";
window.META_PIXEL_ID = "";
window.GA4_ID = "";
window.WANDER_REVIEW_URL = "";
// The review QR (/q/review/) exists only while WANDER_REVIEW_URL is set; build.py reads that line, so keep it on one line.
if (window.WANDER_REVIEW_URL) window.WANDER_LINKS.review = window.WANDER_REVIEW_URL;
// Founding hosts: a bonus hour on the first TOTAL bookings, in return for photos and a few kind words we can share (never tied to a review). Add 1 to TAKEN per confirmed
// booking, then rebuild (python3 build.py): build.py reads these two lines to write the line on /offices/ and /events/ (keep each on one line).
// The line disappears everywhere once TAKEN reaches TOTAL. Real numbers only.
window.FOUNDING_HOSTS_TOTAL = 5;
window.FOUNDING_HOSTS_TAKEN = 0;
// The optional photographer add-on on /offices/ and /events/: whole dollars an hour, GST included, for the whole morning. Leave "" and the option
// does not exist on the site. Sam's cost is not published. Keep the same number in wander-booking/config.js (WANDER_PHOTO_RATE), then rebuild. Keep this on one line (build.py reads it).
window.WANDER_PHOTO_RATE = "80";
