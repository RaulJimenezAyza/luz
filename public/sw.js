// Service worker: la web abre sin conexión con lo último que se vio.
//
// Todo va "primero la red": con conexión siempre se ve lo más nuevo (y se guarda una copia); sin
// conexión se sirve esa copia. Sube VERSION al cambiar la lista de archivos base.

const VERSION = 'luz-v1';
const BASE = ['/', '/estilos.css', '/app.js', '/ventana.js', '/iconos.js', '/fuentes/archivo.woff2', '/icono.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(primeroLaRed(request));
});

async function primeroLaRed(request) {
  const cache = await caches.open(VERSION);
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) cache.put(request, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (guardada) return guardada;
    if (request.mode === 'navigate') return (await cache.match('/')) ?? Response.error();
    throw error;
  }
}
