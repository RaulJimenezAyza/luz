// Lectura de los precios PVPC de Red Eléctrica, compartida por /api/precios y /api/historico.
//
// Fuente: el archivo 70 de ESIOS, público y sin token. Trae 24 filas (25 o 23 los días de cambio de
// hora) con el término de energía del PVPC 2.0TD en €/MWh. Aunque el mercado mayorista va por cuartos
// de hora desde octubre de 2025, el PVPC se sigue publicando por horas. Los precios de mañana salen
// hacia las 20:15; antes de eso no hay datos.

import { horasDelDia, tramosDelDia } from './horario.js';

const FUENTE = 'https://api.esios.ree.es/archives/70/download_json?locale=es&date=';
const VERSION = 2; // sube si cambia la forma de lo que se guarda en caché

/**
 * Precios de un día: { fecha, disponible: false } si aún no está publicado, o
 * { fecha, disponible: true, horas: [{ inicio, fin, precio }] } con instantes en ms UTC y precio en €/kWh.
 * Lanza un Error con un mensaje legible si Red Eléctrica falla o da datos raros.
 *
 * Un día ya publicado no cambia, así que se guarda en la caché de Cloudflare (solo funciona en un
 * dominio propio como luz.reloda.es; en *.pages.dev y en local simplemente se pregunta cada vez).
 */
export async function leerDia(fecha, waitUntil = () => {}) {
  const cache = globalThis.caches?.default;
  const clave = `https://cache.luz.reloda.es/dia/${fecha}/v${VERSION}`;
  const guardada = await cache?.match(clave);
  if (guardada) return guardada.json();

  let datos;
  try {
    const r = await fetch(FUENTE + fecha, { cf: { cacheTtl: 300 } });
    if (!r.ok) throw new Error(`Red Eléctrica respondió ${r.status}`);
    datos = await r.json();
  } catch (e) {
    throw new Error(e.message.startsWith('Red Eléctrica') ? e.message : 'No se pudo contactar con Red Eléctrica');
  }

  const filas = datos?.PVPC;
  if (!Array.isArray(filas) || filas.length === 0) return { fecha, disponible: false };

  // Las filas van numeradas, no por hora de reloj (el día de 25 horas llega a "24-25"): cada una se
  // convierte en su instante real para que la web la pinte en la hora de reloj que toque.
  const esperadas = horasDelDia(fecha);
  if (filas.length !== esperadas) throw new Error(`Red Eléctrica dio ${filas.length} horas para un día de ${esperadas}`);
  const tramos = tramosDelDia(fecha, filas.length);
  const dia = {
    fecha,
    disponible: true,
    horas: filas.map((f, i) => ({
      inicio: tramos[i].inicio,
      fin: tramos[i].fin,
      precio: numero(f.PCB) / 1000, // PCB = Península, Canarias y Baleares; €/MWh → €/kWh
    })),
  };

  if (cache) {
    const segundos = fecha < hoyEnMadrid() ? 30 * 86400 : 86400;
    const copia = new Response(JSON.stringify(dia), { headers: { 'cache-control': `public, max-age=${segundos}` } });
    waitUntil(cache.put(clave, copia));
  }
  return dia;
}

/** "208,94" → 208.94 */
function numero(texto) {
  return Number(String(texto).replace(/\./g, '').replace(',', '.'));
}

export function hoyEnMadrid() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
}

/** AAAA-MM-DD más `n` días (n puede ser negativo). */
export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function json(cuerpo, estado, segundosCache) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': segundosCache ? `public, max-age=${segundosCache}` : 'no-store',
    },
  });
}
