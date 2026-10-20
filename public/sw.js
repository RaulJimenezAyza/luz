// Service worker: la web abre sin conexión con lo último que se vio.
//
// Todo va "primero la red": con conexión siempre se ve lo más nuevo (y se guarda una copia); sin
// conexión se sirve esa copia. Sube VERSION al cambiar la lista de archivos base.

const VERSION = 'luz-v2';
const BASE = ['/', '/estilos.css', '/app.js', '/ventana.js', '/iconos.js', '/fuentes/archivo.woff2', '/icono.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION && k !== AJUSTES).map((k) => caches.delete(k))))
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

// ---------- Avisos ----------
// El Worker de avisos/ manda un push vacío cada tarde, cuando ya están los precios de mañana. Aquí se
// piden esos precios y se escribe la notificación con la zona y los impuestos que eligió la persona
// (la página los deja en la caché "luz-ajustes").

const AJUSTES = 'luz-ajustes';

self.addEventListener('push', (e) => e.waitUntil(avisarManana()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      return abierta ? abierta.focus() : self.clients.openWindow('/');
    })
  );
});

async function avisarManana() {
  const ajustes = await leerAjustes();
  let titulo = 'Ya están los precios de mañana';
  let cuerpo = 'Abre Luz barata para ver las mejores horas.';
  try {
    const r = await fetch(`/api/precios?fecha=${mananaEnMadrid()}&v=2`);
    const dia = await r.json();
    if (dia.disponible) ({ titulo, cuerpo } = resumen(dia.horas, ajustes));
  } catch {
    // Sin datos se avisa igual con el texto genérico.
  }
  await self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: '/icono-192.png',
    tag: 'luz-manana',
    lang: 'es',
    data: { url: '/' },
  });
}

/** "Mañana, lo más barato de 14 a 16 h" y las horas más barata y más cara. */
function resumen(horas, { zona, factor }) {
  const hora = (ms) => Number(new Intl.DateTimeFormat('es-ES', { timeZone: zona, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
  const cts = (p) => (p * 100 * factor).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let mejor = 0;
  for (let i = 1; i + 1 < horas.length; i++) {
    if (horas[i].precio + horas[i + 1].precio < horas[mejor].precio + horas[mejor + 1].precio) mejor = i;
  }
  const precios = horas.map((h) => h.precio);
  const iMin = precios.indexOf(Math.min(...precios));
  const iMax = precios.indexOf(Math.max(...precios));
  const inicio = hora(horas[mejor].inicio);
  return {
    titulo: `Mañana, lo más barato de ${inicio} a ${inicio + 2} h`,
    cuerpo: `La hora más barata es a las ${hora(horas[iMin].inicio)} h (${cts(precios[iMin])} cts/kWh) y la más cara, a las ${hora(horas[iMax].inicio)} h (${cts(precios[iMax])} cts).`,
  };
}

async function leerAjustes() {
  try {
    const guardados = await (await caches.open(AJUSTES)).match('/ajustes');
    if (guardados) return { zona: 'Europe/Madrid', factor: 1, ...(await guardados.json()) };
  } catch {}
  return { zona: 'Europe/Madrid', factor: 1 };
}

function mananaEnMadrid() {
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
