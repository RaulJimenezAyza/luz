import { LETRAS, franjaMasBarata, letras, mediaDesde, periodos, tramoDeLetra } from './ventana.js';
import { icono } from './iconos.js';

// Consumos aproximados por uso; solo sirven para dar el coste y el ahorro en euros.
const APARATOS = [
  { nombre: 'Lavadora', icono: 'lavadora', horas: 2, kwh: 0.9 },
  { nombre: 'Lavavajillas', icono: 'lavavajillas', horas: 2, kwh: 1.1 },
  { nombre: 'Secadora', icono: 'secadora', horas: 2, kwh: 2.5 },
  { nombre: 'Horno', icono: 'horno', horas: 1, kwh: 1.2 },
  { nombre: 'Termo eléctrico', icono: 'termo', horas: 2, kwh: 3 },
  { nombre: 'Coche eléctrico', icono: 'coche', horas: 6, kwh: 14, nota: 'en un enchufe normal' },
];

const OSCURAS = new Set(['C', 'D', 'E']); // letras sobre amarillo: texto oscuro
// Las horas se pintan en la hora de la península o de Canarias (una menos); el precio es el mismo.
const ZONAS = { peninsula: 'Europe/Madrid', canarias: 'Atlantic/Canary' };
const estado = { hoy: null, manana: null, diaVisible: 'hoy', zona: zonaInicial() };
const formatos = {};
const formatoHora = (zona) =>
  (formatos[zona] ??= new Intl.DateTimeFormat('es-ES', { timeZone: ZONAS[zona], hour: '2-digit', hourCycle: 'h23' }));

function zonaInicial() {
  try {
    const guardada = localStorage.getItem('zona');
    if (guardada in ZONAS) return guardada;
  } catch {}
  return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Atlantic/Canary' ? 'canarias' : 'peninsula';
}
const $ = (id) => document.getElementById(id);

// ---------- Formato ----------
const numero = (n, dec) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const cts = (precio) => numero(precio * 100, 1); // €/kWh → céntimos
const euros = (n) => `${numero(n, 2)} €`;
// Hora de reloj de cada tramo en la zona elegida. El fin se cuenta como inicio + 1 para que el día de
// 25 horas muestre dos veces "2–3 h" (que es lo que pasa) en vez de un raro "2–2 h".
const horaIni = (h) => Number(formatoHora(estado.zona).format(new Date(h.inicio)));
const horaFin = (h) => horaIni(h) + 1;
const minutosHasta = (ms) => Math.max(0, Math.round((ms - Date.now()) / 60_000));
const reloj = (n) => `${String(n).padStart(2, '0')}:00`;
const duracion = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};
const chip = (letra) =>
  `<span class="letra l-${letra}${OSCURAS.has(letra) ? ' oscura' : ''}" aria-label="letra ${letra}">${letra}</span>`;


async function iniciar() {
  prepararTema();
  prepararZona();
  prepararSinConexion();
  const ahora = enMadrid();
  const largo = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('fecha-hoy').textContent = largo[0].toUpperCase() + largo.slice(1);

  const [hoy, manana] = await Promise.all([cargar(ahora.fecha), cargar(sumarDia(ahora.fecha))]);
  estado.hoy = hoy;
  estado.manana = manana;

  if (!hoy?.disponible) {
    $('titular').textContent = 'No hemos podido cargar los precios de hoy';
    $('veredicto-texto').textContent = navigator.onLine
      ? 'Red Eléctrica no responde ahora mismo. Vuelve a intentarlo en unos minutos.'
      : 'No tienes conexión y no hay precios de hoy guardados. Ábrela cuando vuelvas a tener internet.';
    return;
  }

  prepararPestanas();
  pintarTodo();
  $('calc-horas').addEventListener('input', pintarCalculadora);
  $('calc-kwh').addEventListener('input', pintarCalculadora);

  let ancho = 0;
  new ResizeObserver(([e]) => {
    if (Math.round(e.contentRect.width) !== ancho) {
      ancho = Math.round(e.contentRect.width);
      pintarGrafico();
    }
  }).observe($('grafico'));

  // Cada minuto se repinta (cambia la hora, la cuenta atrás); desde las 20:15 se mira si ya está mañana.
  setInterval(async () => {
    const { fecha, hora, minuto } = enMadrid();
    // Pasada la medianoche, mañana pasa a ser hoy.
    if (fecha !== estado.hoy.fecha) {
      estado.hoy = estado.manana?.fecha === fecha && estado.manana.disponible ? estado.manana : await cargar(fecha);
      estado.manana = await cargar(sumarDia(fecha));
      if (!estado.hoy?.disponible) return;
      prepararPestanas();
    }
    if (!estado.manana?.disponible && (hora > 20 || (hora === 20 && minuto >= 15)) && minuto % 5 === 0) {
      estado.manana = await cargar(sumarDia(enMadrid().fecha));
      if (estado.manana?.disponible) prepararPestanas();
    }
    pintarTodo();
  }, 60_000);
}

// ---------- Modo claro / oscuro ----------
// Sin elección guardada se sigue al sistema; el botón fija claro u oscuro y lo recuerda en este navegador.
const oscuroSistema = matchMedia('(prefers-color-scheme: dark)');
const temaActual = () => document.documentElement.dataset.theme || (oscuroSistema.matches ? 'dark' : 'light');

function prepararTema() {
  const boton = $('boton-tema');
  // Los dos iconos están siempre; el CSS muestra uno u otro con un pequeño giro al cambiar.
  boton.innerHTML = `<span class="ico-sol">${icono('sol')}</span><span class="ico-luna">${icono('luna')}</span>`;
  const pintar = () => {
    const oscuro = temaActual() === 'dark';
    boton.dataset.modo = oscuro ? 'oscuro' : 'claro';
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    boton.title = oscuro ? 'Modo claro' : 'Modo oscuro';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = oscuro ? '#111111' : '#ffffff'));
  };
  boton.addEventListener('click', () => {
    const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('tema', nuevo); } catch {}
    pintar();
  });
  oscuroSistema.addEventListener('change', pintar);
  pintar();
}

function prepararZona() {
  const botones = document.querySelectorAll('.zonas button');
  const marcar = () => botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zona === estado.zona)));
  botones.forEach((b) =>
    b.addEventListener('click', () => {
      estado.zona = b.dataset.zona;
      try { localStorage.setItem('zona', estado.zona); } catch {}
      marcar();
      if (estado.hoy?.disponible) pintarTodo();
    })
  );
  marcar();
}

// Sube VERSION_API cada vez que cambie el formato de /api/precios: las respuestas se guardan 24 h en la
// caché del navegador y una antigua con otro formato dejaría la página colgada.
const VERSION_API = 2;

// ---------- Sin conexión ----------
function prepararSinConexion() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const aviso = () => ($('aviso-conexion').hidden = navigator.onLine);
  addEventListener('online', aviso);
  addEventListener('offline', aviso);
  aviso();
}

async function cargar(fecha) {
  try {
    const r = await fetch(`/api/precios?fecha=${fecha}&v=${VERSION_API}`);
    const datos = await r.json();
    if (datos?.disponible && !datos.horas.every((h) => Number.isFinite(h.inicio) && Number.isFinite(h.fin))) return null;
    return datos;
  } catch {
    return null;
  }
}

function prepararPestanas() {
  const boton = document.querySelector('[data-dia="manana"]');
  boton.disabled = !estado.manana?.disponible;
  boton.title = boton.disabled ? 'Se publica hacia las 20:15' : '';
  document.querySelectorAll('.pestanas button').forEach((b) => {
    b.onclick = () => {
      estado.diaVisible = b.dataset.dia;
      document.querySelectorAll('.pestanas button').forEach((o) => o.setAttribute('aria-selected', String(o === b)));
      pintarDia();
    };
  });
}

function pintarTodo() {
  pintarEtiqueta();
  pintarVeredicto();
  pintarDia();
  pintarAparatos();
  pintarCalculadora();
}

// ---------- Datos derivados ----------

/** Índice de la hora actual dentro de los precios de hoy. */
function indiceAhora() {
  const ahora = Date.now();
  const i = estado.hoy.horas.findIndex((h) => h.inicio <= ahora && ahora < h.fin);
  return i === -1 ? 0 : i;
}

/** Hoy y, si ya está, mañana en una sola lista. Las letras se calculan dentro de cada día. */
function serie() {
  const marcar = (d, dia) => {
    const l = letras(d.horas.map((h) => h.precio));
    return d.horas.map((h, i) => ({ ...h, dia, letra: l[i], tramo: tramoDeLetra(l[i]) }));
  };
  return [...marcar(estado.hoy, 'hoy'), ...(estado.manana?.disponible ? marcar(estado.manana, 'mañana') : [])];
}

const media = (lista) => lista.reduce((a, b) => a + b, 0) / lista.length;

// ---------- La etiqueta de hoy ----------
function pintarEtiqueta() {
  const horas = estado.hoy.horas;
  const l = letras(horas.map((h) => h.precio));
  const actual = indiceAhora();
  const fecha = new Date(`${estado.hoy.fecha}T12:00:00Z`);
  $('etiqueta-dia').textContent = `Hoy · ${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(fecha)}`;

  // Tramos de horas seguidas con la misma letra.
  const grupos = periodos(l);
  $('escala').innerHTML = LETRAS.map((letra, i) => {
    const suyos = grupos.filter((g) => g.tramo === letra);
    const texto = suyos.length
      ? suyos.map((g) => {
          const t = g.fin - g.inicio === 1 ? `${horaIni(horas[g.inicio])} h` : `${horaIni(horas[g.inicio])}–${horaFin(horas[g.fin - 1])} h`;
          return g.fin <= actual ? `<span class="pasada">${t}</span>` : t;
        }).join(', ')
      : '<span class="vacia">Ninguna hora</span>';
    const esAhora = l[actual] === letra;
    return `<li class="fila">
      <div class="fila-izq">
        <span class="flecha${OSCURAS.has(letra) ? ' oscura' : ''}" style="--i:${i}; background: var(--${letra})">${letra}</span>
        <span class="fila-horas">${texto}</span>
      </div>
      ${esAhora ? `<span class="puntero" title="Ahora">${letra}</span>` : '<span></span>'}
    </li>`;
  }).join('');
}

// ---------- La respuesta ----------
function pintarVeredicto() {
  const s = serie();
  const i = indiceAhora();
  const actual = s[i];
  const mediaHoy = media(estado.hoy.horas.map((h) => h.precio));
  $('titular').innerHTML = {
    barato: `Ahora la luz está barata ${chip(actual.letra)}`,
    medio: `Ahora la luz tiene un precio normal ${chip(actual.letra)}`,
    caro: `Ahora la luz está cara ${chip(actual.letra)}`,
  }[actual.tramo];

  const dif = (actual.precio - mediaHoy) / mediaHoy;
  const comparacion = Math.abs(dif) < 0.03
    ? 'justo la media de hoy'
    : `un ${numero(Math.abs(dif) * 100, 0)} % ${dif > 0 ? 'más' : 'menos'} que la media de hoy`;
  $('veredicto-texto').innerHTML =
    `Entre las ${horaIni(actual)} y las ${horaFin(actual)}, el kWh cuesta <strong>${cts(actual.precio)} céntimos</strong>: ${comparacion}.`;

  let html;
  if (actual.tramo === 'barato') {
    let fin = i;
    while (fin + 1 < s.length && s[fin + 1].tramo === 'barato') fin++;
    html = `
      <p class="proxima-frase">Aprovecha: sigue barata hasta las</p>
      <p class="proxima-hora">${reloj(horaFin(s[fin]))}</p>
      <p class="proxima-detalle">Quedan ${duracion(minutosHasta(s[fin].fin))}${s[fin].dia === 'mañana' ? ', pasada la medianoche' : ''}.</p>`;
  } else {
    const k = s.findIndex((h, j) => j > i && h.tramo === 'barato');
    if (k === -1) {
      html = `
        <p class="proxima-frase">Hoy ya no quedan horas baratas.</p>
        <p class="proxima-detalle">Los precios de mañana se publican hacia las 20:15.</p>`;
    } else {
      let fin = k;
      while (fin + 1 < s.length && s[fin + 1].tramo === 'barato') fin++;
      html = `
        <p class="proxima-frase">La próxima hora barata es ${s[k].dia === 'mañana' ? 'mañana ' : ''}a las</p>
        <p class="proxima-hora">${reloj(horaIni(s[k]))} ${chip(s[k].letra)}</p>
        <p class="proxima-detalle">Dentro de ${duracion(minutosHasta(s[k].inicio))} · barata hasta las ${reloj(horaFin(s[fin]))}</p>`;
    }
  }
  $('proxima').innerHTML = html;
}

// ---------- El día ----------
function pintarDia() {
  const dia = estado[estado.diaVisible];
  const fecha = new Date(`${dia.fecha}T12:00:00Z`);
  const texto = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fecha);
  $('sub-dia').textContent = `${texto[0].toUpperCase()}${texto.slice(1)}. Céntimos por kWh y la letra de cada hora.`;
  pintarGrafico();
  pintarTabla(dia.horas, letras(dia.horas.map((h) => h.precio)));
}

function pintarGrafico() {
  const cont = $('grafico');
  const dia = estado[estado.diaVisible];
  if (!dia?.disponible) return;
  const horas = dia.horas;
  const valores = horas.map((h) => h.precio * 100);
  const l = letras(valores);
  const esHoy = estado.diaVisible === 'hoy';
  const actual = esHoy ? indiceAhora() : -1;

  const W = Math.max(300, cont.clientWidth);
  const H = W < 560 ? 260 : 320;
  const m = { arriba: 40, abajo: 54, izquierda: 30 };
  const pw = W - m.izquierda;
  const ph = H - m.arriba - m.abajo;

  const maxV = Math.max(...valores);
  const paso = [2, 5, 10, 20, 50].find((p) => maxV / p <= 5) ?? 100;
  const tope = Math.ceil(maxV / paso) * paso;
  const y = (v) => m.arriba + ph * (1 - v / tope);
  const base = m.arriba + ph;
  const hueco = pw / horas.length;
  const ancho = Math.min(24, hueco - 2);
  const centro = (i) => m.izquierda + i * hueco + hueco / 2;

  let svg = '';
  if (actual >= 0) svg += `<rect class="zona-actual" x="${m.izquierda + actual * hueco}" y="${m.arriba - 30}" width="${hueco}" height="${ph + 60}" rx="6"/>`;
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    svg += `<line class="${v === 0 ? 'base' : 'rejilla'}" x1="${m.izquierda}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="eje" x="${m.izquierda - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }

  const lado = Math.min(18, hueco - 3);
  valores.forEach((v, i) => {
    const x = centro(i) - ancho / 2, arriba = y(v), r = Math.min(4, ancho / 2, base - arriba);
    const pasada = esHoy && i < actual ? ' pasada' : '';
    svg += `<path class="barra${pasada}" data-i="${i}" style="fill: var(--${l[i]})" d="M${x},${base} V${arriba + r} Q${x},${arriba} ${x + r},${arriba} H${x + ancho - r} Q${x + ancho},${arriba} ${x + ancho},${arriba + r} V${base} Z"/>`;
    // La letra de cada hora, como en la etiqueta.
    svg += `<g class="chip${pasada}"><rect x="${centro(i) - lado / 2}" y="${base + 7}" width="${lado}" height="${lado}" rx="3" style="fill: var(--${l[i]})"/>
      <text class="chip-letra" x="${centro(i)}" y="${base + 7 + lado / 2 + 4}" text-anchor="middle" fill="${OSCURAS.has(l[i]) ? '#0d0d0d' : '#ffffff'}">${l[i]}</text></g>`;
  });

  // Etiquetas selectivas: la más barata, la más cara y "ahora".
  const iMin = valores.indexOf(Math.min(...valores));
  const iMax = valores.indexOf(Math.max(...valores));
  for (const i of new Set([iMin, iMax])) {
    if (i === actual) continue;
    svg += `<text class="valor" x="${centro(i)}" y="${y(valores[i]) - 8}" text-anchor="middle">${numero(valores[i], 1)}</text>`;
  }
  if (actual >= 0) {
    const yA = y(valores[actual]);
    svg += `<path class="ahora-marca" d="M${centro(actual) - 5},${yA - 12} h10 l-5,6 z"/>`;
    svg += `<text class="ahora-texto" x="${centro(actual)}" y="${yA - 17}" text-anchor="middle">Ahora</text>`;
  }

  const cada = hueco < 22 ? 6 : 3;
  horas.forEach((h, i) => {
    if (i % cada === 0) svg += `<text class="eje" x="${centro(i)}" y="${H - 4}" text-anchor="middle">${horaIni(h)} h</text>`;
  });

  horas.forEach((h, i) => {
    const etiqueta = `De ${horaIni(h)} a ${horaFin(h)} h: ${numero(valores[i], 1)} céntimos, letra ${l[i]}`;
    svg += `<rect class="zona" data-i="${i}" tabindex="0" aria-label="${etiqueta}" x="${m.izquierda + i * hueco}" y="${m.arriba - 30}" width="${hueco}" height="${ph + 60}"/>`;
  });

  cont.querySelector('svg')?.remove();
  cont.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Precio de la luz por horas">${svg}</svg>`);

  const tooltip = $('tooltip');
  const mostrar = (i) => {
    cont.querySelectorAll('.barra.activa').forEach((b) => b.classList.remove('activa'));
    cont.querySelector(`.barra[data-i="${i}"]`).classList.add('activa');
    const marca = document.createElement('span');
    marca.className = `letra l-${l[i]}${OSCURAS.has(l[i]) ? ' oscura' : ''}`;
    marca.textContent = l[i];
    const datos = document.createElement('div');
    const fuerte = document.createElement('strong');
    fuerte.textContent = `${numero(valores[i], 1)} cts/kWh`;
    const detalle = document.createElement('span');
    detalle.textContent = `De ${reloj(horaIni(horas[i]))} a ${reloj(horaFin(horas[i]))}`;
    datos.append(fuerte, detalle);
    tooltip.replaceChildren(marca, datos);
    tooltip.style.left = `${Math.min(W - 80, Math.max(80, centro(i)))}px`;
    tooltip.style.top = `${y(valores[i]) - (i === actual ? 26 : 0)}px`;
    tooltip.hidden = false;
  };
  const ocultar = () => {
    tooltip.hidden = true;
    cont.querySelectorAll('.barra.activa').forEach((b) => b.classList.remove('activa'));
  };
  cont.querySelectorAll('.zona').forEach((z) => {
    const i = Number(z.dataset.i);
    z.addEventListener('pointerenter', () => mostrar(i));
    z.addEventListener('focus', () => mostrar(i));
    z.addEventListener('pointerleave', ocultar);
    z.addEventListener('blur', ocultar);
  });
}

function pintarTabla(horas, l) {
  const filas = (desde, hasta) => horas.slice(desde, hasta).map((h, k) =>
    `<tr><td>${reloj(horaIni(h))} – ${reloj(horaFin(h))}</td><td>${cts(h.precio)}</td><td>${chip(l[desde + k])}</td></tr>`).join('');
  const mitad = Math.ceil(horas.length / 2);
  const tabla = (a, b) => `<table><thead><tr><th>Hora</th><th>cts/kWh</th><th>Letra</th></tr></thead><tbody>${filas(a, b)}</tbody></table>`;
  $('tabla').innerHTML = `<div class="cols">${tabla(0, mitad)}${tabla(mitad, horas.length)}</div>`;
}

// ---------- Aparatos ----------

/** Mejor momento desde ahora para algo que tarda `horas` y gasta `kwh`. */
function recomendar(horas, kwh) {
  const s = serie();
  const precios = s.map((h) => h.precio);
  const desde = indiceAhora();
  const mejor = franjaMasBarata(precios, horas, desde);
  if (!mejor) return null;
  const ya = mediaDesde(precios, horas, desde);
  return {
    s, desde, inicio: mejor.inicio, horas,
    coste: mejor.media * kwh,
    costeYa: ya * kwh,
    ahorro: (ya - mejor.media) * kwh,
    ahora: mejor.inicio === desde,
  };
}

function cuando(r) {
  const ini = r.s[r.inicio], fin = r.s[r.inicio + r.horas - 1];
  if (r.ahora) return { hora: 'Ya', hasta: `Es el mejor momento, hasta las ${reloj(horaFin(fin))}` };
  return {
    hora: reloj(horaIni(ini)),
    hasta: `${ini.dia === 'mañana' ? 'Mañana, h' : 'H'}asta las ${reloj(horaFin(fin))}`,
  };
}

function franja(r) {
  const celdas = r.s.slice(r.desde);
  const n = celdas.length;
  const a = r.inicio - r.desde;
  const html = celdas.map((h, k) =>
    `<span class="franja-celda${k >= a && k < a + r.horas ? ' dentro' : ''}" style="background: var(--${h.letra})"></span>`).join('');
  const marco = `<span class="franja-marco" style="left: calc((100% + 2px) * ${a} / ${n} - 4px); width: calc((100% + 2px) * ${r.horas} / ${n} + 6px)"></span>`;
  const hayManana = celdas.some((h) => h.dia === 'mañana');
  return `<div class="franja" aria-hidden="true">${html}${marco}</div>
    <div class="franja-ejes"><span>Ahora</span><span>${hayManana ? 'Mañana, 24 h' : '24 h'}</span></div>`;
}

function pintarAparatos() {
  $('lista-aparatos').innerHTML = APARATOS.map((a) => {
    const r = recomendar(a.horas, a.kwh);
    const nombre = `
      <div class="aparato-nombre">${icono(a.icono)}
        <div><h3>${a.nombre}</h3><p class="aparato-meta">${a.horas} h · unos ${numero(a.kwh, a.kwh % 1 ? 1 : 0)} kWh${a.nota ? `, ${a.nota}` : ''}</p></div>
      </div>`;
    if (!r) {
      return `<div class="aparato" role="listitem">${nombre}<div class="cuando"><p class="cuando-hasta">Faltan datos: los precios de mañana salen hacia las 20:15.</p></div></div>`;
    }
    const c = cuando(r);
    return `
      <div class="aparato" role="listitem">
        ${nombre}
        <div class="cuando"><p class="cuando-hora">${c.hora}</p><p class="cuando-hasta">${c.hasta}</p></div>
        <div class="franja-bloque">${franja(r)}</div>
        <div class="coste">
          <p class="coste-precio">${euros(r.coste)}</p>
          ${r.ahora ? '' : `<p class="coste-ya">${euros(r.costeYa)} si lo pones ya</p>`}
          ${!r.ahora && r.ahorro >= 0.01 ? `<p class="coste-ahorro">Ahorras ${euros(r.ahorro)}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

function pintarCalculadora() {
  const horas = Number($('calc-horas').value);
  const kwh = Number($('calc-kwh').value);
  $('calc-horas-v').textContent = `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  $('calc-kwh-v').textContent = `${numero(kwh, kwh % 1 ? 1 : 0)} kWh`;
  const r = recomendar(horas, kwh);
  if (!r) {
    $('calc-resultado').textContent = 'Aún no hay precios para una franja tan larga. Los de mañana salen hacia las 20:15.';
    return;
  }
  const ini = r.s[r.inicio];
  $('calc-resultado').innerHTML = r.ahora
    ? `<strong>Ponlo ya</strong>Te costará ${euros(r.coste)}.`
    : `<strong>${ini.dia === 'mañana' ? 'Mañana a' : 'A'} las ${reloj(horaIni(ini))}</strong>${euros(r.coste)} en vez de ${euros(r.costeYa)}${r.ahorro >= 0.01 ? `: ahorras ${euros(r.ahorro)}` : ''}.`;
}

// ---------- Fechas ----------

/** Fecha (AAAA-MM-DD), hora y minuto actuales en la España peninsular, sea cual sea la zona del navegador. */
function enMadrid(fecha = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(fecha).map((x) => [x.type, x.value])
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

function sumarDia(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

iniciar();
