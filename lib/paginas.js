// Páginas fijas para Google: /manana, /lavadora y /coche-electrico. Cada una responde a una búsqueda
// concreta ("precio luz mañana", "a qué hora poner la lavadora"…) con las cifras del día ya escritas en
// el HTML, sin JavaScript, y manda a la web para lo demás (zona, horario, aparatos propios).
//
// Los precios van con impuestos y en hora peninsular, como sale la web por defecto.

import { franjaMasBarata, letras } from '../public/ventana.js';
import { hoyEnMadrid, leerDia, sumarDias } from './esios.js';

// Los mismos que en public/app.js (impuesto eléctrico y luego IVA, península).
const FACTOR = (1 + 0.0511269632) * (1 + 0.21);
const DESPIERTO = { desde: 8, hasta: 23 };
const OSCURAS = new Set(['C', 'D', 'E']);

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const numero = (n, dec) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const cts = (precio) => numero(precio * 100 * FACTOR, 1);
const euros = (n) => `${numero(n, 2)} €`;
const reloj = (n) => `${String(n % 24).padStart(2, '0')}:00`;
const horaMadrid = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23' });
const hora = (h) => Number(horaMadrid.format(new Date(h.inicio)));
const fechaLarga = (fecha) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${fecha}T12:00:00Z`));
const chip = (l) => `<span class="letra l-${l}${OSCURAS.has(l) ? ' oscura' : ''}">${l}</span>`;

/** Resumen de un día: hora más barata y más cara, media y letra de cada hora. */
function resumir(dia) {
  const precios = dia.horas.map((h) => h.precio);
  const ls = letras(precios);
  const iMin = precios.indexOf(Math.min(...precios));
  const iMax = precios.indexOf(Math.max(...precios));
  const media = precios.reduce((a, b) => a + b, 0) / precios.length;
  return { precios, ls, iMin, iMax, media };
}

/** Franja más barata de `horas` seguidas; con `despierto`, solo entre las 8:00 y las 23:00. */
function mejorFranja(dia, horas, despierto) {
  const permitida = despierto ? dia.horas.map((h) => hora(h) >= DESPIERTO.desde && hora(h) + 1 <= DESPIERTO.hasta) : null;
  const f = franjaMasBarata(dia.horas.map((h) => h.precio), horas, 0, permitida);
  return f && { ...f, desde: hora(dia.horas[f.inicio]), hasta: hora(dia.horas[f.inicio + horas - 1]) + 1 };
}

const tramo = (r, i) => `de ${reloj(hora(r.dia.horas[i]))} a ${reloj(hora(r.dia.horas[i]) + 1)}`;

function tabla(r) {
  const filas = r.dia.horas.map((h, i) =>
    `<tr><td>${reloj(hora(h))}–${reloj(hora(h) + 1)}</td><td>${cts(h.precio)}</td><td>${chip(r.ls[i])}</td></tr>`).join('');
  return `<table class="tabla-fija"><caption>Precio de cada hora, en céntimos por kWh con impuestos</caption>
        <thead><tr><th scope="col">Hora</th><th scope="col">cts/kWh</th><th scope="col">Letra</th></tr></thead>
        <tbody>${filas}</tbody></table>`;
}

const PAGINAS = {
  manana: {
    ruta: '/manana',
    titulo: 'Precio de la luz mañana, hora a hora · Luz barata',
    descripcion: 'El precio de la luz de mañana hora a hora (PVPC): la hora más barata, la más cara y cuándo poner la lavadora o cargar el coche. Se publica hacia las 20:15.',
    async cuerpo(dias) {
      const r = dias.manana ?? dias.hoy;
      const publicado = Boolean(dias.manana);
      const lav = mejorFranja(r.dia, 2, true);
      return `
      <h1>Precio de la luz mañana${publicado ? `, ${esc(fechaLarga(r.dia.fecha))}` : ''}</h1>
      ${publicado
        ? `<p class="lectura-entrada">Mañana la hora más barata es ${tramo(r, r.iMin)}, a <strong>${cts(r.precios[r.iMin])} céntimos el kWh</strong>, y la más cara ${tramo(r, r.iMax)}, a ${cts(r.precios[r.iMax])}. El precio medio del día es de ${cts(r.media)} céntimos.</p>`
        : `<p class="lectura-entrada">Red Eléctrica publica los precios de mañana cada tarde, hacia las 20:15. Todavía no están: mientras, estos son los de hoy. La hora más barata de hoy es ${tramo(r, r.iMin)}, a <strong>${cts(r.precios[r.iMin])} céntimos el kWh</strong>.</p>`}
      ${lav ? `<p>Para la lavadora (2 horas, mientras estás despierto), lo más barato ${publicado ? 'mañana' : 'hoy'} es de ${reloj(lav.desde)} a ${reloj(lav.hasta)}.</p>` : ''}
      <p><a class="boton" href="/">Ver ${publicado ? 'mañana' : 'hoy'} en la etiqueta, hora a hora</a></p>
      <h2>${publicado ? 'Mañana' : 'Hoy'}, hora a hora</h2>
      ${tabla(r)}
      <h2>¿Cuándo salen los precios de mañana?</h2>
      <p>Cada día, entre las 20:00 y las 20:30, Red Eléctrica publica los precios PVPC del día siguiente. Desde ese momento salen aquí y en la pestaña «Mañana» de la web. Si instalas la web en el móvil, puede avisarte cuando estén.</p>`;
    },
  },
  lavadora: {
    ruta: '/lavadora',
    titulo: '¿A qué hora poner la lavadora hoy? · Luz barata',
    descripcion: 'La hora más barata de hoy para poner la lavadora con la tarifa PVPC, cuánto cuesta cada lavado y cuánto ahorras frente a la hora más cara.',
    async cuerpo(dias) {
      const r = dias.hoy;
      const lav = mejorFranja(r.dia, 2, true);
      const peor = (() => { let m = null; for (let i = 0; i + 2 <= r.precios.length; i++) { const s = (r.precios[i] + r.precios[i + 1]) / 2; if (!m || s > m) m = s; } return m; })();
      const kwh = 0.9;
      const m = dias.manana && mejorFranja(dias.manana.dia, 2, true);
      return `
      <h1>¿A qué hora pongo la lavadora hoy?</h1>
      ${lav ? `<p class="lectura-entrada">Hoy, lo más barato para la lavadora es ponerla <strong>de ${reloj(lav.desde)} a ${reloj(lav.hasta)}</strong>, a ${cts(lav.media)} céntimos el kWh. Un lavado normal (unos 0,9 kWh) cuesta así ${euros(lav.media * FACTOR * kwh)}, frente a ${euros(peor * FACTOR * kwh)} en las horas más caras.</p>` : ''}
      ${m ? `<p>Mañana, lo más barato es de ${reloj(m.desde)} a ${reloj(m.hasta)}.</p>` : ''}
      <p>Se cuenta un programa de 2 horas mientras estás despierto (de 8:00 a 23:00). En la web puedes cambiar tu horario, la duración y lo que gasta tu lavadora.</p>
      <p><a class="boton" href="/#aparatos">Calcularlo con mi lavadora y mi horario</a></p>
      <h2>Hoy, hora a hora</h2>
      ${tabla(r)}
      <h2>¿Merece la pena esperar?</h2>
      <p>Con la tarifa regulada PVPC el precio cambia cada hora. La diferencia en un lavado son céntimos, pero junto con el lavavajillas, la secadora o el termo suma bastante a final de mes. Si tienes una tarifa de precio fijo, la hora no cambia nada.</p>`;
    },
  },
  'coche-electrico': {
    ruta: '/coche-electrico',
    titulo: 'Mejor hora para cargar el coche eléctrico hoy · Luz barata',
    descripcion: 'Las horas más baratas de hoy para cargar el coche eléctrico en casa con la tarifa PVPC, y cuánto cuesta la carga.',
    async cuerpo(dias) {
      const r = dias.hoy;
      const horas = 6;
      const kwh = 14;
      const f = mejorFranja(r.dia, horas, false);
      const m = dias.manana && mejorFranja(dias.manana.dia, horas, false);
      return `
      <h1>¿Cuándo cargo el coche eléctrico hoy?</h1>
      ${f ? `<p class="lectura-entrada">Hoy, las 6 horas seguidas más baratas para cargar el coche son <strong>de ${reloj(f.desde)} a ${reloj(f.hasta)}</strong>, a ${cts(f.media)} céntimos el kWh. Una carga de unos 14 kWh (unos 100 km) cuesta así ${euros(f.media * FACTOR * kwh)}, frente a ${euros(r.media * FACTOR * kwh)} si cargas a cualquier hora.</p>` : ''}
      ${m ? `<p>Mañana, lo más barato es de ${reloj(m.desde)} a ${reloj(m.hasta)}.</p>` : ''}
      <p>En la web puedes poner cuántas horas tarda tu coche y cuánto carga.</p>
      <p><a class="boton" href="/#aparatos">Calcularlo con mi coche</a></p>
      <h2>Hoy, hora a hora</h2>
      ${tabla(r)}
      <h2>¿Y si tengo una tarifa para coche eléctrico?</h2>
      <p>Estas horas son para la tarifa regulada PVPC, que cambia cada hora. Muchas tarifas de coche eléctrico tienen un precio fijo de madrugada: en ese caso, carga en las horas que te marque tu contrato.</p>`;
    },
  },
};

const OTRAS = [['/', 'Precio de la luz hoy'], ['/manana', 'Precio de la luz mañana'], ['/lavadora', '¿Cuándo pongo la lavadora?'], ['/coche-electrico', '¿Cuándo cargo el coche?']];

function html(p, cuerpo) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(p.titulo)}</title>
    <meta name="description" content="${esc(p.descripcion)}" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)" />
    <script>
      try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch {}
    </script>
    <link rel="canonical" href="https://luz.reloda.es${p.ruta}" />
    <link rel="icon" href="/icono.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="es_ES" />
    <meta property="og:url" content="https://luz.reloda.es${p.ruta}" />
    <meta property="og:site_name" content="Luz barata" />
    <meta property="og:title" content="${esc(p.titulo)}" />
    <meta property="og:description" content="${esc(p.descripcion)}" />
    <meta property="og:image" content="https://luz.reloda.es/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preload" href="/fuentes/archivo.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/estilos.css" />
  </head>
  <body>
    <header class="cabecera">
      <a class="marca" href="/">
        <svg class="marca-logo" viewBox="0 0 28 24" aria-hidden="true">
          <path d="M0 1h12l4 3.5-4 3.5H0z" fill="#009640" />
          <path d="M0 8.5h17l4 3.5-4 3.5H0z" fill="#ffed00" />
          <path d="M0 16h22l4 3.5-4 3.5H0z" fill="#e2001a" />
        </svg>
        Luz barata
      </a>
      <a class="boton" href="/">Ver los precios</a>
    </header>

    <main class="lectura">${cuerpo}
      <p class="lectura-fecha">Precios de la tarifa regulada PVPC (2.0TD) de Red Eléctrica, península y Baleares, con impuesto eléctrico e IVA. No incluye la potencia ni el contador.</p>
      <nav class="otras-paginas" aria-label="Más en Luz barata">${OTRAS.filter(([r]) => r !== p.ruta).map(([r, t]) => `<a href="${r}">${esc(t)}</a>`).join(' · ')}</nav>
    </main>
  </body>
</html>
`;
}

/** Respuesta de una página fija (clave de PAGINAS). Si Red Eléctrica falla, una página corta que manda a la web. */
export async function servirPagina(clave, waitUntil) {
  const p = PAGINAS[clave];
  const hoy = hoyEnMadrid();
  let cuerpo;
  try {
    const [dHoy, dManana] = await Promise.all([leerDia(hoy, waitUntil), leerDia(sumarDias(hoy, 1), waitUntil).catch(() => null)]);
    if (!dHoy.disponible) throw new Error('Sin precios de hoy');
    const conResumen = (dia) => (dia?.disponible ? { dia, ...resumir(dia) } : null);
    cuerpo = await p.cuerpo({ hoy: conResumen(dHoy), manana: conResumen(dManana) });
  } catch {
    cuerpo = `
      <h1>${esc(p.titulo.split(' · ')[0])}</h1>
      <p class="lectura-entrada">Ahora mismo no llegan los precios de Red Eléctrica. Prueba en la web, que vuelve a intentarlo sola.</p>
      <p><a class="boton" href="/">Ver los precios</a></p>`;
  }
  return new Response(html(p, cuerpo), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Cambia al publicarse mañana (20:15) y a medianoche: poco rato en caché.
      'cache-control': 'public, max-age=600',
    },
  });
}

export const rutasFijas = Object.values(PAGINAS).map((p) => p.ruta);
