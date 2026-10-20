// GET /api/precios?fecha=AAAA-MM-DD → precios PVPC de ese día, hora a hora, en €/kWh, con el inicio
// y el fin de cada hora como instantes (ms UTC).
//
// Fuente: el archivo 70 de ESIOS (Red Eléctrica), público y sin token. Trae 24 filas (25 o 23 los
// días de cambio de hora) con el término de energía del PVPC 2.0TD en €/MWh. Ojo: aunque el
// mercado mayorista va por cuartos de hora desde octubre de 2025, el PVPC se sigue publicando por
// horas. Los precios de mañana salen hacia las 20:15; antes de eso no hay datos.
//
// La función hace de intermediario porque el navegador no puede llamar a ESIOS directamente
// (CORS) y para cachear: un día ya publicado no cambia.

import { horasDelDia, tramosDelDia } from '../../lib/horario.js';

const FUENTE = 'https://api.esios.ree.es/archives/70/download_json?locale=es&date=';

export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const fecha = url.searchParams.get('fecha') ?? hoyEnMadrid();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'Fecha no válida' }, 400, 0);

  // La caché de Cloudflare solo funciona en un dominio propio (luz.reloda.es); en *.pages.dev
  // y en local no guarda nada, y no pasa nada: simplemente se pregunta a ESIOS cada vez.
  const cache = caches.default;
  const clave = new Request(`${url.origin}/api/precios?fecha=${fecha}&v=2`); // v: formato de la respuesta
  const guardada = await cache.match(clave);
  if (guardada) return guardada;

  let datos;
  try {
    const r = await fetch(FUENTE + fecha, { cf: { cacheTtl: 300 } });
    if (!r.ok) return json({ error: `Red Eléctrica respondió ${r.status}` }, 502, 0);
    datos = await r.json();
  } catch {
    return json({ error: 'No se pudo contactar con Red Eléctrica' }, 502, 0);
  }

  const filas = datos?.PVPC;
  // Sin filas = día aún no publicado. Se cachea poco para volver a mirar pronto.
  if (!Array.isArray(filas) || filas.length === 0) return json({ fecha, disponible: false, horas: [] }, 200, 300);

  // Las filas van numeradas, no por hora de reloj (el día de 25 horas llega a "24-25"): cada una se
  // convierte en su instante real para que la web la pinte en la hora de reloj que toque.
  if (filas.length !== horasDelDia(fecha)) {
    return json({ error: `Red Eléctrica dio ${filas.length} horas para un día de ${horasDelDia(fecha)}` }, 502, 0);
  }
  const tramos = tramosDelDia(fecha, filas.length);
  const horas = filas.map((f, i) => ({
    inicio: tramos[i].inicio, // ms UTC
    fin: tramos[i].fin,
    precio: numero(f.PCB) / 1000, // PCB = Península, Canarias y Baleares; €/MWh → €/kWh
  }));

  const respuesta = json({ fecha, disponible: true, horas }, 200, 86400);
  waitUntil(cache.put(clave, respuesta.clone()));
  return respuesta;
}

/** "208,94" → 208.94 */
function numero(texto) {
  return Number(String(texto).replace(/\./g, '').replace(',', '.'));
}

function hoyEnMadrid() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
}

function json(cuerpo, estado, segundosCache) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': segundosCache ? `public, max-age=${segundosCache}` : 'no-store',
    },
  });
}
