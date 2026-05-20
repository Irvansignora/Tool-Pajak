// ============================================================
// PajakTools Service Worker
// Strategi: Cache-first untuk semua aset, dengan auto-update
// Setiap kali ada versi baru, user diberi notifikasi.
// ============================================================

const CACHE_NAME = 'pajak-tools-v10';

// Semua file yang di-cache saat install (precache)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './libs/pdf.min.js',
  './libs/pdf.worker.min.js',
  './libs/xlsx.full.min.js',
  './libs/jszip.min.js',
];

// ── Install: cache semua aset utama ──────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Jangan tunggu tab lama ditutup — langsung aktif
  self.skipWaiting();
});

// ── Activate: hapus cache versi lama ────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, fallback ke network ──────────────────
self.addEventListener('fetch', event => {
  // Hanya handle GET request
  if (event.request.method !== 'GET') return;

  // Untuk CDN external (jszip dll), gunakan network-first
  const url = new URL(event.request.url);
  const isExternal = url.origin !== self.location.origin;

  if (isExternal) {
    event.respondWith(networkFirstStrategy(event.request));
  } else {
    event.respondWith(cacheFirstStrategy(event.request));
  }
});

// Cache-first: ambil dari cache, jika tidak ada baru ke network
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline dan tidak ada cache — return halaman offline sederhana
    return new Response(
      '<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#080c14;color:#e2eaf8"><h2>⚡ PajakTools</h2><p>Kamu sedang offline. Buka dulu satu kali saat online agar semua fitur tersimpan.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// Network-first: coba network, fallback ke cache
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 503 });
  }
}

// ── Pesan dari halaman (skip waiting on demand) ──────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
