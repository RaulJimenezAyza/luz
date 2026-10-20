// GET /api/historico?dias=30 → precio medio, mínimo y máximo (€/kWh) de cada uno de los últimos días,
// hasta hoy incluido. Sirve para comparar hoy con ayer, la semana y el mes.
//
// Cada día sale de lib/esios.js (y de su caché: un día pasado no cambia), así que tras la primera
// visita apenas se pregunta a Red Eléctrica. El plan gratuito de Cloudflare permite 50 peticiones
// por invocación: por eso el máximo es 40 días.

import { hoyEnMadrid, json, leerDia, sumarDias } from '../../lib/esios.js';

const EN_PARALELO = 6;

export async function onRequestGet({ request, waitUntil }) {
  const pedidos = Number(new URL(request.url).searchParams.get('dias') ?? 30);
  const dias = Math.min(40, Math.max(7, Number.isFinite(pedidos) ? Math.round(pedidos) : 30));
  const hoy = hoyEnMadrid();
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(hoy, i - dias + 1));

  const resultados = [];
  for (let i = 0; i < fechas.length; i += EN_PARALELO) {
    const tanda = fechas.slice(i, i + EN_PARALELO);
    resultados.push(...(await Promise.all(tanda.map((f) => leerDia(f, waitUntil).catch(() => null)))));
  }

  const resumen = resultados
    .filter((d) => d?.disponible)
    .map((d) => {
      const precios = d.horas.map((h) => h.precio);
      return {
        fecha: d.fecha,
        media: precios.reduce((a, b) => a + b, 0) / precios.length,
        min: Math.min(...precios),
        max: Math.max(...precios),
      };
    });

  if (!resumen.length) return json({ error: 'No se pudo leer ningún día de Red Eléctrica' }, 502, 0);
  return json({ hasta: hoy, dias: resumen }, 200, 3600);
}
