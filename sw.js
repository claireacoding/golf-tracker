/*
  Fairway Ledger — the offline copy
  ----------------------------------
  This file is a service worker. It is not the scorecard. app.js still
  does the scoring, the saving, and the drawing. The browser runs this
  file beside the page and can ask it to answer requests for files.

  Why bother:
  A phone on the course often has no signal. Without a service worker
  the browser has to download the page again every visit, and the card
  simply does not open offline. This script keeps a copy of the app on
  the phone so the next visit can skip the network.

  What "caching" means here:
  The Cache Storage is a box of saved responses, one file in, one file
  out, kept by the browser after the tab closes. It is not an upload.
  Nothing in the box is sent to a server. It is also not where the
  rounds live. Two shelves, on purpose:

    localStorage    the rounds you typed (STORAGE_KEY in app.js)
    Cache Storage   the app itself: page, styles, script, icons, fonts

  The card can open with no signal because both shelves are already
  on the phone. Quit and come back, and the rounds are still in
  localStorage. The page that draws them is in this cache.

  Paths start with "./" on purpose. The published site lives in a
  folder (https://claireacoding.digital/golf-tracker/), not at the
  domain root. "/style.css" would ask the root and miss. "./style.css"
  asks for the file next to this worker, so the same list works in
  that folder and on a local server.

  The fonts are files in fonts/, not a request to Google. They are in
  the list below so the typewriter labels and the handwriting look the
  same with no signal. Licenses for those files are in fonts/NOTICE.txt.
  The license text is not part of the running app, so it is not cached.

  Three events do the whole job.

  1. install
     The browser has just downloaded this worker. We open a box named
     CACHE_VERSION and download every app file into it. That fill-up
     is the precache. addAll is all-or-nothing: if one file 404s, the
     install fails and the previous worker (if any) keeps its job.

  2. activate
     This worker is taking over. Any box whose name is not the current
     CACHE_VERSION is an older copy of the app. We delete those so the
     phone does not keep last month's files forever.

     Bump CACHE_VERSION when you change a file in the list. The new
     name is what makes install save a fresh set and activate throw
     the old set away. If you change style.css and forget the name,
     phones keep showing the saved copy.

     The browser checks sw.js itself for updates on each visit. Do not
     add sw.js to the precache list; a saved copy of the worker is not
     what decides whether an update exists.

  3. fetch
     The page asked for a file. If the box has it, we hand that copy
     back and never touch the network. That is "cache first", and it
     is why a refresh still works in airplane mode. If the box does
     not have it, we try the network. If the network fails too and the
     request was a page load, we fall back to the saved index.html so
     the card still appears.

  skipWaiting and clients.claim, in short: a new version should take
  over without waiting for every tab to close. The page that is already
  on screen keeps what it already loaded until the next refresh.
*/

// Change this string when you change any file in PRECACHE_URLS.
var CACHE_VERSION = "fairway-ledger-v1";

var PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./fonts/architects-daughter-400-latin.woff2",
  "./fonts/architects-daughter-400-latin-ext.woff2",
  "./fonts/libre-baskerville-400-latin.woff2",
  "./fonts/libre-baskerville-400-latin-ext.woff2",
  "./fonts/libre-baskerville-400-italic-latin.woff2",
  "./fonts/libre-baskerville-400-italic-latin-ext.woff2",
  "./fonts/libre-baskerville-700-latin.woff2",
  "./fonts/libre-baskerville-700-latin-ext.woff2",
  "./fonts/special-elite-400-latin.woff2",
  "./fonts/special-elite-400-latin-ext.woff2"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      // Don't wait for old tabs to close before this version can run.
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      var stale = [];
      var i;
      for (i = 0; i < names.length; i += 1) {
        if (names[i] !== CACHE_VERSION) stale.push(caches.delete(names[i]));
      }
      return Promise.all(stale);
    }).then(function () {
      // Control pages that are already open, not only the next visit.
      return self.clients.claim();
    })
  );
});

function offlineFallback() {
  return new Response(
    "<!DOCTYPE html><meta charset=\"utf-8\"><title>Fairway Ledger</title><p>Open Fairway Ledger once while you are online so this phone can keep a copy.</p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).catch(function () {
      // A full page load can be satisfied by the saved card. A missing
      // image or font should just fail, and CSS fallbacks take over.
      if (request.mode === "navigate") {
        return caches.match("./index.html").then(function (page) {
          return page || offlineFallback();
        });
      }
      return new Response("", { status: 504, statusText: "Offline" });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url;
  // Scores are written to localStorage by app.js. They are not fetched,
  // and a POST would not be one of our files. Only simple reads.
  if (request.method !== "GET") return;
  url = new URL(request.url);
  // Leave any other site alone. This worker only knows our folder.
  if (url.origin !== self.location.origin) return;
  event.respondWith(cacheFirst(request));
});
