// GET /api/precios?fecha=AAAA-MM-DD → precios PVPC de ese día, hora a hora, en €/kWh, con el inicio
// y el fin de cada hora como instantes (ms UTC). Sin fecha, hoy.
//
// La función hace de intermediario porque el navegador no puede llamar a ESIOS directamente (CORS)
// y para cachear. La lectura en sí está en lib/esios.js.

import { hoyEnMadrid, json, leerDia } from '../../lib/esios.js';

export async function onRequestGet({ request, waitUntil }) {
  const fecha = new URL(request.url).searchParams.get('fecha') ?? hoyEnMadrid();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: 'Fecha no válida' }, 400, 0);

  try {
    const dia = await leerDia(fecha, waitUntil);
    // Sin publicar todavía: se cachea poco para volver a mirar pronto.
    return dia.disponible ? json(dia, 200, 86400) : json({ ...dia, horas: [] }, 200, 300);
  } catch (e) {
    return json({ error: e.message }, 502, 0);
  }
}
