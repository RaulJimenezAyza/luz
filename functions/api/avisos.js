// POST   /api/avisos { suscripcion, zona } → guarda la suscripción push de este navegador.
// DELETE /api/avisos { endpoint }          → la borra.
//
// Las suscripciones viven en Cloudflare KV (binding AVISOS). No hay datos personales: solo la dirección
// del servicio push del navegador. El envío lo hace el Worker de avisos/ cada tarde.
//
// Solo se aceptan direcciones de los servicios push conocidos (Google, Mozilla, Apple, Microsoft):
// así nadie puede usar el Worker para mandar peticiones a cualquier otra web.

import { json } from '../../lib/esios.js';

const SERVICIOS_PUSH = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export async function onRequestPost({ request, env }) {
  if (!env.AVISOS) return json({ error: 'Los avisos no están configurados' }, 503, 0);
  const cuerpo = await request.json().catch(() => null);
  const suscripcion = cuerpo?.suscripcion;
  if (!endpointValido(suscripcion?.endpoint)) return json({ error: 'Suscripción no válida' }, 400, 0);

  const zona = cuerpo.zona === 'canarias' ? 'canarias' : 'peninsula';
  await env.AVISOS.put(await clave(suscripcion.endpoint), JSON.stringify({ suscripcion, zona, alta: Date.now() }), {
    metadata: { endpoint: suscripcion.endpoint }, // el Worker lo lee al listar, sin un get por suscripción
  });
  return json({ ok: true }, 201, 0);
}

export async function onRequestDelete({ request, env }) {
  if (!env.AVISOS) return json({ error: 'Los avisos no están configurados' }, 503, 0);
  const cuerpo = await request.json().catch(() => null);
  if (!endpointValido(cuerpo?.endpoint)) return json({ error: 'Suscripción no válida' }, 400, 0);
  await env.AVISOS.delete(await clave(cuerpo.endpoint));
  return json({ ok: true }, 200, 0);
}

function endpointValido(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && SERVICIOS_PUSH.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

async function clave(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return `sub:${[...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
