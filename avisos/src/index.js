// Worker de avisos: cada tarde, cuando Red Eléctrica publica los precios de mañana, manda una
// notificación push a cada navegador suscrito.
//
// El push va sin contenido ("data-less"): solo despierta al service worker de la web (public/sw.js), que
// pide los precios de mañana y escribe él mismo la notificación en la zona y con los impuestos que haya
// elegido esa persona. Así no hace falta cifrar nada aquí, solo firmar con VAPID.
//
// El cron salta cada 10 minutos entre las 18:00 y las 20:50 UTC (20:00–22:50 en verano, 19:00–21:50 en
// invierno). En cada vuelta: si mañana ya está publicado y queda gente por avisar, se avisa a un lote de
// 40 (el plan gratuito permite 50 peticiones por ejecución) y se guarda por dónde va.

import { hoyEnMadrid, leerDia, sumarDias } from '../../lib/esios.js';
import { firmaVapid } from './vapid.js';

const POR_VUELTA = 40;

export default {
  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(avisar(env, { forzar: false }));
  },

  // GET /probar?clave=… manda los avisos de mañana ya (para probar), aunque se hayan mandado hoy.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/probar' && env.CLAVE_PRUEBA && url.searchParams.get('clave') === env.CLAVE_PRUEBA) {
      return Response.json(await avisar(env, { forzar: true }));
    }
    return new Response('Avisos de luz.reloda.es', { status: 404 });
  },
};

async function avisar(env, { forzar }) {
  const manana = sumarDias(hoyEnMadrid(), 1);
  const hecho = `enviado:${manana}`;
  const marcaCursor = `cursor:${manana}`;
  if (!forzar && (await env.AVISOS.get(hecho))) return { estado: 'ya enviado', manana };

  const dia = await leerDia(manana).catch(() => null);
  if (!dia?.disponible) return { estado: 'mañana aún no está publicado', manana };

  const cursor = forzar ? undefined : (await env.AVISOS.get(marcaCursor)) ?? undefined;
  const lote = await env.AVISOS.list({ prefix: 'sub:', limit: POR_VUELTA, cursor });

  let enviados = 0, borrados = 0, fallos = 0;
  await Promise.all(lote.keys.map(async ({ name, metadata }) => {
    const r = await empujar(metadata?.endpoint, env).catch(() => null);
    if (r?.ok) enviados++;
    else if (r && (r.status === 404 || r.status === 410)) {
      await env.AVISOS.delete(name); // el navegador ya no existe o se dio de baja
      borrados++;
    } else fallos++;
  }));

  if (!forzar) {
    if (lote.list_complete) {
      await env.AVISOS.put(hecho, '1', { expirationTtl: 3 * 86400 });
      await env.AVISOS.delete(marcaCursor);
    } else {
      await env.AVISOS.put(marcaCursor, lote.cursor, { expirationTtl: 86400 });
    }
  }
  return { estado: lote.list_complete ? 'enviado' : 'enviado un lote, sigue en la próxima vuelta', manana, enviados, borrados, fallos };
}

async function empujar(endpoint, env) {
  if (!endpoint) return null;
  const autorizacion = await firmaVapid(new URL(endpoint).origin, env.VAPID_PUBLICA, env.VAPID_PRIVADA);
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: autorizacion,
      TTL: String(12 * 3600), // si el móvil está apagado, el aviso aún vale unas horas
      Urgency: 'normal',
      Topic: 'luz-manana', // si llegan dos, el segundo sustituye al primero
    },
  });
}
