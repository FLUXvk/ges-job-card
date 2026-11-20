/* Green Job Cards — service worker: whole app works offline */
const VERSION = 'green-jobcards-v1.1.0';
const SHELL = ['./', './index.html', './manifest.webmanifest', './js/towns.js', './js/app.js', './js/flow.js', './js/pdf.js', './lib/xlsx.mini.min.js',
  './lib/jspdf.umd.min.js', './lib/jspdf.plugin.autotable.min.js', './assets/logo.png', './assets/watermark.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (e.request.mode === 'navigate') { e.respondWith(caches.match('./index.html').then(r => r || fetch(e.request))); return; }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
