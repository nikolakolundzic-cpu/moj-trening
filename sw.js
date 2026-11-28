// Service worker: brzo otvaranje iz keša, rad bez interneta + podsjetnici (Firebase Cloud Messaging)
importScripts('./firebase-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
try { firebase.initializeApp(self.firebaseConfig); firebase.messaging(); } catch (e) {}

const CACHE = 'trening-v9';
const SHELL = ['./', './index.html', './firebase-config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const LIBS = ['app', 'auth', 'firestore', 'messaging'].map(n => 'https://www.gstatic.com/firebasejs/10.12.2/firebase-' + n + '.js');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(LIBS.map(u => c.add(u).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Iz keša odmah, a u pozadini provjeri ima li nova verzija.
async function fresh(req, e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('./index.html') : null);
  const copy = hit ? hit.clone() : null;
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(async r => {
    if (r.ok) {
      const nt = await r.clone().text();
      const old = copy ? await copy.text() : null;
      await c.put(req, r.clone());
      if (req.mode === 'navigate') await c.put('./index.html', r.clone());
      if (old !== null && old !== nt && (req.mode === 'navigate' || req.url.endsWith('.html'))) {
        // nova stranica možda još nije spremna, pa probaj par puta
        for (let i = 0; i < 40; i++) {
          const cl = e.resultingClientId && await self.clients.get(e.resultingClientId);
          if (cl) { cl.postMessage('upd'); break; }
          if (!e.resultingClientId) { (await self.clients.matchAll({ type: 'window' })).forEach(c => c.postMessage('upd')); break; }
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }
    return r;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net.catch(() => c.match('./index.html'));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('googleapis.com') && !url.hostname.startsWith('fonts')) return;
  const own = url.origin === location.origin;
  const lib = url.hostname === 'www.gstatic.com' || url.hostname.startsWith('fonts.');
  if (!own && !lib) return;
  if (own) {
    if (url.pathname.endsWith('sw.js')) return;
    e.respondWith(fresh(req, e));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); caches.open(CACHE).then(k => k.put(req, c)); return n; })));
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
