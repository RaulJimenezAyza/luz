// GET /api/historico?dias=30 → precio medio, mínimo y máximo (€/kWh) de cada uno de los últimos días,
// hasta hoy incluido (y lo mismo para Ceuta y Melilla en `cym`). Sirve para comparar hoy con ayer, la semana y el mes.
//
// Cada día sale de lib/esios.js (y de su caché: un día pasado no cambia), así que tras la primera
// visita apenas se pregunta a Red Eléctrica. El plan gratuito de Cloudflare permite 50 peticiones
// por invocación: por eso el máximo es 40 días.

import { hoyEnMadrid, json, leerDia, sumarDias } from '../../lib/esios.js';

const EN_PARALELO = 6;

export async function onRequestGet({ request, waitUntil }) {
  const pedidos = Number(new URL(request.url).searchParams.get('dias') ?? 30);
  const numero = Math.min(40, Math.max(7, Number.isFinite(pedidos) ? Math.round(pedidos) : 30));
  const hoy = hoyEnMadrid();
  const fechas = Array.from({ length: numero }, (_, i) => sumarDias(hoy, i - numero + 1));

  const resultados = [];
  for (let i = 0; i < fechas.length; i += EN_PARALELO) {
    const tanda = fechas.slice(i, i + EN_PARALELO);
    resultados.push(...(await Promise.all(tanda.map((f) => leerDia(f, waitUntil).catch(() => null)))));
  }

  const lista = resultados
    .filter((d) => d?.disponible)
    .map((d) => ({
      fecha: d.fecha,
      ...resumen(d.horas.map((h) => h.precio)), // península, Baleares y Canarias
      cym: resumen(d.horas.map((h) => h.precioCym ?? h.precio)), // Ceuta y Melilla
    }));

  if (!lista.length) return json({ error: 'No se pudo leer ningún día de Red Eléctrica' }, 502, 0);
  return json({ hasta: hoy, dias: lista }, 200, 3600);
}

function resumen(precios) {
  return { media: precios.reduce((a, b) => a + b, 0) / precios.length, min: Math.min(...precios), max: Math.max(...precios) };
}
