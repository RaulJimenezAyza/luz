import { LETRAS, dentroDeHorario, franjaMasBarata, letras, mediaDesde, periodos, tramoDeLetra } from './ventana.js';
import { icono } from './iconos.js';
import { analizar, leerCsv } from './consumo.js';

// Aparatos de serie. Consumos aproximados por uso: solo sirven para dar el coste y el ahorro en euros.
// `despierto`: solo se puede poner cuando estás despierto (hay que estar para ponerlo o recogerlo).
const APARATOS_DE_SERIE = [
  { id: 'lavadora', nombre: 'Lavadora', icono: 'lavadora', horas: 2, kwh: 0.9, despierto: true },
  { id: 'lavavajillas', nombre: 'Lavavajillas', icono: 'lavavajillas', horas: 2, kwh: 1.1, despierto: false },
  { id: 'secadora', nombre: 'Secadora', icono: 'secadora', horas: 2, kwh: 2.5, despierto: true },
  { id: 'horno', nombre: 'Horno', icono: 'horno', horas: 1, kwh: 1.2, despierto: true },
  { id: 'termo', nombre: 'Termo eléctrico', icono: 'termo', horas: 2, kwh: 3, despierto: false },
  { id: 'coche', nombre: 'Coche eléctrico', icono: 'coche', horas: 6, kwh: 14, despierto: false },
];
const HORARIO_DE_SERIE = { desde: 8, hasta: 23 };

// Impuestos por kWh para pasar del precio de Red Eléctrica a lo que se paga. Vigentes desde el
// 1 de junio de 2026: impuesto eléctrico 5,11269632 % y luego IVA 21 % (en Canarias, IGIC 0 % para
// la luz de casa; en Ceuta y Melilla, IPSI 1 %). Revisar si el Gobierno vuelve a rebajarlos. No
// incluye la potencia contratada ni el alquiler del contador, que no dependen de la hora.
const IMPUESTO_ELECTRICO = 0.0511269632;
const IVA = { peninsula: 0.21, canarias: 0, ceutamelilla: 0.01 };
const NOMBRE_IVA = { peninsula: 'IVA', canarias: 'IGIC', ceutamelilla: 'IPSI' };
const ICONOS_APARATO = new Set(['lavadora', 'lavavajillas', 'secadora', 'horno', 'termo', 'coche', 'enchufe']);

const OSCURAS = new Set(['C', 'D', 'E']); // letras sobre amarillo: texto oscuro
// Las horas se pintan en la hora de cada zona (Canarias, una menos). Ceuta y Melilla tienen la hora de
// la península, pero su propio precio (precioCym) y su propio impuesto (IPSI).
const ZONAS = { peninsula: 'Europe/Madrid', canarias: 'Atlantic/Canary', ceutamelilla: 'Africa/Ceuta' };
const estado = {
  hoy: null, manana: null, diaVisible: 'hoy', zona: zonaInicial(),
  aparatos: leerAparatos(), horario: leerHorario(), editando: false,
  impuestos: leer('impuestos') ?? true, historico: null, consumo: null,
};
/**
 * Pone en `precio` el de la zona elegida: el de la API (península, Baleares y Canarias) o el de Ceuta y
 * Melilla. El original se guarda la primera vez en `precioPcb` (y en el histórico, en `pcb`).
 */
function aplicarZona() {
  const cym = estado.zona === 'ceutamelilla';
  for (const dia of [estado.hoy, estado.manana]) {
    if (!dia?.disponible) continue;
    for (const h of dia.horas) {
      h.precioPcb ??= h.precio;
      h.precio = cym ? h.precioCym : h.precioPcb;
    }
  }
  for (const d of estado.historico ?? []) {
    d.pcb ??= { media: d.media, min: d.min, max: d.max };
    Object.assign(d, cym && d.cym ? d.cym : d.pcb);
  }
}
const factorImpuestos = () => (estado.impuestos ? (1 + IMPUESTO_ELECTRICO) * (1 + IVA[estado.zona]) : 1);
const formatos = {};
const formatoHora = (zona) =>
  (formatos[zona] ??= new Intl.DateTimeFormat('es-ES', { timeZone: ZONAS[zona], hour: '2-digit', hourCycle: 'h23' }));

function zonaInicial() {
  try {
    const guardada = localStorage.getItem('zona');
    if (guardada in ZONAS) return guardada;
  } catch {}
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zona === 'Atlantic/Canary' ? 'canarias' : zona === 'Africa/Ceuta' ? 'ceutamelilla' : 'peninsula';
}
const $ = (id) => document.getElementById(id);

// ---------- Lo que se guarda en este navegador ----------
// Tus aparatos y tu horario viven en localStorage: sin cuenta y sin servidor. Si el navegador no deja
// guardar (modo privado), la web funciona igual con los de serie.
function leer(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch {}
}
function leerAparatos() {
  const guardados = leer('aparatos');
  if (!Array.isArray(guardados)) return structuredClone(APARATOS_DE_SERIE);
  return guardados
    .filter((a) => a && typeof a.nombre === 'string')
    .map((a) => ({
      id: String(a.id || crypto.randomUUID()),
      nombre: a.nombre.slice(0, 40),
      icono: ICONOS_APARATO.has(a.icono) ? a.icono : 'enchufe',
      horas: Math.min(10, Math.max(1, Math.round(Number(a.horas) || 1))),
      kwh: Math.min(50, Math.max(0.1, Number(a.kwh) || 1)),
      despierto: Boolean(a.despierto),
    }));
}
function leerHorario() {
  const h = leer('horario');
  const valida = (n) => Number.isInteger(n) && n >= 0 && n <= 24;
  return h && valida(h.desde) && valida(h.hasta) ? { desde: h.desde, hasta: h.hasta } : { ...HORARIO_DE_SERIE };
}

/** Texto del usuario dentro de HTML. */
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Formato ----------
const numero = (n, dec) => n.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const cts = (precio) => numero(precio * 100 * factorImpuestos(), 1); // €/kWh → céntimos, con o sin impuestos
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
  prepararImpuestos();
  pintarAvisos();
  prepararConsumo();
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
  $('calc-despierto').addEventListener('change', pintarCalculadora);
  prepararAparatos();
  cargarHistorico();
  let anchoHistorico = 0;
  new ResizeObserver(([e]) => {
    if (estado.historico && Math.round(e.contentRect.width) !== anchoHistorico) {
      anchoHistorico = Math.round(e.contentRect.width);
      pintarComparacion();
    }
  }).observe($('grafico-historico'));

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
      cargarHistorico();
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
const VERSION_API = 3;

// ---------- Con o sin impuestos ----------
function prepararImpuestos() {
  const casilla = $('con-impuestos');
  casilla.checked = estado.impuestos;
  casilla.addEventListener('change', () => {
    estado.impuestos = casilla.checked;
    guardar('impuestos', estado.impuestos);
    if (estado.hoy?.disponible) pintarTodo();
  });
}

function pintarNotaImpuestos() {
  const pct = (n) => numero(n * 100, n * 100 % 1 ? 2 : 0);
  $('nota-impuestos').textContent = estado.impuestos
    ? `Ya incluyen el impuesto eléctrico (${pct(IMPUESTO_ELECTRICO)} %) y el ${NOMBRE_IVA[estado.zona]} (${pct(IVA[estado.zona])} %), pero no la potencia contratada ni el alquiler del contador, que pagas igual a cualquier hora.`
    : 'Se muestran sin impuestos, tal como los publica Red Eléctrica: con ellos pagarías en torno a un 27 % más.';
}

// ---------- Avisos cada tarde ----------
// Notificaciones push: el navegador se suscribe con la clave pública VAPID y la suscripción se guarda en
// /api/avisos. Cada tarde el Worker de avisos/ despierta al service worker, que escribe la notificación.

const VAPID_PUBLICA = 'BPHImHOiBgeKXZlj7rOG11y9hUUx2VyzVYvGEqZoFY56p-eDGTxwcfPVgXfZ-2OWwpXEHWm8Rp6oprGaIQJbra4';
const esIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const hayPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** La zona y los impuestos elegidos, para que el service worker escriba el aviso igual que la web. */
async function guardarAjustesAvisos() {
  try {
    const cache = await caches.open('luz-ajustes');
    const campo = estado.zona === 'ceutamelilla' ? 'precioCym' : 'precio';
    await cache.put('/ajustes', new Response(JSON.stringify({ zona: ZONAS[estado.zona], factor: factorImpuestos(), campo })));
  } catch {}
}

async function suscripcionActual() {
  if (!hayPush) return null;
  const registro = await navigator.serviceWorker.getRegistration();
  return registro ? registro.pushManager.getSubscription() : null;
}

async function pintarAvisos(mensaje = '') {
  const caja = $('avisos');
  if (!hayPush) {
    caja.innerHTML = esIos && !instalada
      ? `<p class="avisos-nota">${icono('campana')}<span>¿Quieres un aviso cada tarde con las horas baratas de mañana? En iPhone, primero añade la web a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela desde ahí.</span></p>`
      : '';
    return;
  }
  if (Notification.permission === 'denied') {
    caja.innerHTML = `<p class="avisos-nota">${icono('campanaNo')}<span>Tienes bloqueadas las notificaciones de esta web. Actívalas en los ajustes del navegador si quieres el aviso de cada tarde.</span></p>`;
    return;
  }
  const activa = await suscripcionActual().catch(() => null);
  caja.innerHTML = activa
    ? `<p class="avisos-ok">${icono('campana')}<span>Avisos activados: cada tarde te decimos las horas baratas de mañana.</span>
         <button type="button" class="enlace" id="avisos-quitar">Desactivar</button></p>`
    : `<button type="button" class="boton" id="avisos-activar">${icono('campana')}<span>Avísame cada tarde</span></button>
       <p class="avisos-texto">${mensaje || 'Te diremos las mejores horas de mañana en cuanto Red Eléctrica publique los precios, hacia las 20:30.'}</p>`;
  $('avisos-activar')?.addEventListener('click', activarAvisos);
  $('avisos-quitar')?.addEventListener('click', desactivarAvisos);
}

async function activarAvisos() {
  const boton = $('avisos-activar');
  boton.disabled = true;
  boton.querySelector('span').textContent = 'Activando…';
  try {
    if ((await Notification.requestPermission()) !== 'granted') return pintarAvisos();
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64url(VAPID_PUBLICA) });
    const r = await fetch('/api/avisos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ suscripcion, zona: estado.zona }),
    });
    if (!r.ok) {
      await suscripcion.unsubscribe();
      throw new Error();
    }
    await guardarAjustesAvisos();
    registro.showNotification('Avisos activados', {
      body: 'Cada tarde, cuando salgan los precios de mañana, te diremos las mejores horas.',
      icon: '/icono-192.png',
      tag: 'luz-alta',
    });
    pintarAvisos();
  } catch {
    pintarAvisos('No se han podido activar los avisos. Vuelve a intentarlo en un momento.');
  }
}

async function desactivarAvisos() {
  const suscripcion = await suscripcionActual().catch(() => null);
  if (suscripcion) {
    await fetch('/api/avisos', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: suscripcion.endpoint }),
    }).catch(() => {});
    await suscripcion.unsubscribe().catch(() => {});
  }
  pintarAvisos();
}

function deBase64url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (texto.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

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
    if (datos?.disponible && !datos.horas.every((h) => Number.isFinite(h.inicio) && Number.isFinite(h.fin) && Number.isFinite(h.precioCym))) return null;
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
  aplicarZona();
  pintarNotaImpuestos();
  guardarAjustesAvisos();
  pintarEtiqueta();
  pintarVeredicto();
  pintarDia();
  pintarAparatos();
  pintarCalculadora();
  if (estado.historico) pintarComparacion();
  pintarConsumo();
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
  const valores = horas.map((h) => h.precio * 100 * factorImpuestos());
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

/**
 * Mejor momento desde ahora para algo que tarda `horas` y gasta `kwh`. Con `soloDespierto`, la franja
 * entera tiene que caer en tu horario. Sin franja posible devuelve { motivo: 'datos' | 'horario' }.
 */
function recomendar(horas, kwh, soloDespierto) {
  const s = serie();
  const precios = s.map((h) => h.precio);
  const desde = indiceAhora();
  if (desde + horas > s.length) return { motivo: 'datos' };
  const permitida = soloDespierto ? s.map((h) => dentroDeHorario(horaIni(h) % 24, estado.horario)) : null;
  const mejor = franjaMasBarata(precios, horas, desde, permitida);
  if (!mejor) return { motivo: 'horario' };
  const ya = mediaDesde(precios, horas, desde);
  // Si ahora mismo no se puede (estás durmiendo), no tiene sentido comparar con "ponerlo ya".
  const puedeYa = !permitida || permitida.slice(desde, desde + horas).every(Boolean);
  return {
    s, desde, inicio: mejor.inicio, horas, permitida, puedeYa,
    coste: mejor.media * kwh * factorImpuestos(),
    costeYa: ya * kwh * factorImpuestos(),
    ahorro: puedeYa ? (ya - mejor.media) * kwh * factorImpuestos() : 0,
    ahora: mejor.inicio === desde,
  };
}

const textoSinFranja = (r) =>
  r.motivo === 'datos'
    ? 'Aún no hay precios para tanto tiempo. Los de mañana salen hacia las 20:15.'
    : `No cabe dentro de tu horario en lo que queda${estado.manana?.disponible ? ' de hoy y mañana' : ' de hoy. Los precios de mañana salen hacia las 20:15'}.`;

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
  const html = celdas.map((h, k) => {
    const fuera = r.permitida && !r.permitida[r.desde + k];
    const clase = k >= a && k < a + r.horas ? ' dentro' : fuera ? ' fuera' : '';
    return `<span class="franja-celda${clase}" style="--color: var(--${h.letra})"></span>`;
  }).join('');
  const marco = `<span class="franja-marco" style="left: calc((100% + 2px) * ${a} / ${n} - 4px); width: calc((100% + 2px) * ${r.horas} / ${n} + 6px)"></span>`;
  const hayManana = celdas.some((h) => h.dia === 'mañana');
  return `<div class="franja" aria-hidden="true">${html}${marco}</div>
    <div class="franja-ejes"><span>Ahora</span><span>${hayManana ? 'Mañana, 24 h' : '24 h'}</span></div>`;
}

function prepararAparatos() {
  const opciones = (sel) =>
    Array.from({ length: 25 }, (_, h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${reloj(h)}</option>`).join('');
  $('horario-desde').innerHTML = opciones(estado.horario.desde);
  $('horario-hasta').innerHTML = opciones(estado.horario.hasta);
  const alCambiarHorario = () => {
    estado.horario = { desde: Number($('horario-desde').value), hasta: Number($('horario-hasta').value) };
    guardar('horario', estado.horario);
    pintarAparatos();
    pintarCalculadora();
  };
  $('horario-desde').addEventListener('change', alCambiarHorario);
  $('horario-hasta').addEventListener('change', alCambiarHorario);

  $('editar-aparatos').addEventListener('click', () => {
    estado.editando = !estado.editando;
    pintarAparatos();
    if (estado.editando) $('lista-aparatos').querySelector('input')?.focus();
  });

  // En edición, cada cambio se guarda al momento sin repintar (así no se pierde el foco al escribir).
  const lista = $('lista-aparatos');
  lista.addEventListener('input', (e) => {
    const fila = e.target.closest('[data-id]');
    const aparato = fila && estado.aparatos.find((a) => a.id === fila.dataset.id);
    if (!aparato) return;
    const campo = e.target.dataset.campo;
    if (campo === 'nombre') aparato.nombre = e.target.value.slice(0, 40);
    if (campo === 'horas') aparato.horas = Number(e.target.value);
    if (campo === 'kwh' && Number(e.target.value) > 0) aparato.kwh = Math.min(50, Number(e.target.value));
    if (campo === 'despierto') aparato.despierto = e.target.checked;
    guardar('aparatos', estado.aparatos);
  });
  lista.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === 'borrar') {
      estado.aparatos = estado.aparatos.filter((a) => a.id !== boton.closest('[data-id]').dataset.id);
    } else if (accion === 'anadir') {
      estado.aparatos.push({ id: crypto.randomUUID(), nombre: 'Nuevo aparato', icono: 'enchufe', horas: 1, kwh: 1, despierto: true });
    } else if (accion === 'serie') {
      estado.aparatos = structuredClone(APARATOS_DE_SERIE);
    } else if (accion === 'listo') {
      estado.editando = false;
    }
    guardar('aparatos', estado.aparatos);
    pintarAparatos();
    if (accion === 'anadir') {
      const campos = lista.querySelectorAll('[data-campo="nombre"]');
      campos[campos.length - 1]?.select();
    }
    if (accion === 'listo') $('editar-aparatos').focus();
  });
}

function pintarAparatos() {
  const boton = $('editar-aparatos');
  boton.innerHTML = estado.editando ? `${icono('hecho')}<span>Listo</span>` : `${icono('editar')}<span>Editar aparatos</span>`;
  boton.setAttribute('aria-pressed', String(estado.editando));
  $('lista-aparatos').classList.toggle('editando', estado.editando);
  $('lista-aparatos').innerHTML = estado.editando ? filasEditables() : filasNormales();
}

function filasNormales() {
  if (!estado.aparatos.length) {
    return '<p class="lista-vacia">No tienes aparatos. Pulsa «Editar aparatos» para añadir los tuyos.</p>';
  }
  return estado.aparatos.map((a) => {
    const r = recomendar(a.horas, a.kwh, a.despierto);
    const nombre = `
      <div class="aparato-nombre">${icono(a.icono)}
        <div><h3>${esc(a.nombre)}</h3><p class="aparato-meta">${a.horas} h · unos ${numero(a.kwh, a.kwh % 1 ? 1 : 0)} kWh · ${a.despierto ? 'cuando estás despierto' : 'a cualquier hora'}</p></div>
      </div>`;
    if (r.motivo) {
      return `<div class="aparato" role="listitem">${nombre}<div class="cuando sin-franja"><p class="cuando-hasta">${textoSinFranja(r)}</p></div></div>`;
    }
    const c = cuando(r);
    return `
      <div class="aparato" role="listitem">
        ${nombre}
        <div class="cuando"><p class="cuando-hora">${c.hora}</p><p class="cuando-hasta">${c.hasta}</p></div>
        <div class="franja-bloque">${franja(r)}</div>
        <div class="coste">
          <p class="coste-precio">${euros(r.coste)}</p>
          ${r.ahora || !r.puedeYa ? '' : `<p class="coste-ya">${euros(r.costeYa)} si lo pones ya</p>`}
          ${!r.ahora && r.ahorro >= 0.01 ? `<p class="coste-ahorro">Ahorras ${euros(r.ahorro)}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

function filasEditables() {
  const horas = (sel) =>
    Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}"${i + 1 === sel ? ' selected' : ''}>${i + 1} h</option>`).join('');
  const filas = estado.aparatos.map((a) => `
    <div class="aparato" role="listitem" data-id="${esc(a.id)}">
      <div class="aparato-nombre">${icono(a.icono)}
        <input class="campo-texto" type="text" maxlength="40" value="${esc(a.nombre)}" data-campo="nombre" aria-label="Nombre del aparato" />
      </div>
      <label class="campo">Tarda <select data-campo="horas">${horas(a.horas)}</select></label>
      <label class="campo">Gasta <input class="campo-numero" type="number" min="0.1" max="50" step="0.1" value="${a.kwh}" data-campo="kwh" inputmode="decimal" /> kWh</label>
      <label class="interruptor"><input type="checkbox" data-campo="despierto"${a.despierto ? ' checked' : ''} /><span>Solo cuando estoy despierto</span></label>
      <button type="button" class="boton-icono" data-accion="borrar" aria-label="Borrar ${esc(a.nombre)}" title="Borrar">${icono('borrar')}</button>
    </div>`).join('');
  return `${filas}
    <div class="acciones-edicion">
      <button type="button" class="boton" data-accion="anadir">${icono('mas')}<span>Añadir aparato</span></button>
      <button type="button" class="boton boton-suave" data-accion="serie">${icono('deshacer')}<span>Volver a los de serie</span></button>
      <button type="button" class="boton boton-fuerte" data-accion="listo">${icono('hecho')}<span>Listo</span></button>
    </div>`;
}

function pintarCalculadora() {
  const horas = Number($('calc-horas').value);
  const kwh = Number($('calc-kwh').value);
  $('calc-horas-v').textContent = `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  $('calc-kwh-v').textContent = `${numero(kwh, kwh % 1 ? 1 : 0)} kWh`;
  const r = recomendar(horas, kwh, $('calc-despierto').checked);
  if (r.motivo) {
    $('calc-resultado').textContent = textoSinFranja(r);
    return;
  }
  const ini = r.s[r.inicio];
  const comparacion = r.puedeYa ? ` en vez de ${euros(r.costeYa)}${r.ahorro >= 0.01 ? `: ahorras ${euros(r.ahorro)}` : ''}` : '';
  $('calc-resultado').innerHTML = r.ahora
    ? `<strong>Ponlo ya</strong>Te costará ${euros(r.coste)}.`
    : `<strong>${ini.dia === 'mañana' ? 'Mañana a' : 'A'} las ${reloj(horaIni(ini))}</strong>${euros(r.coste)}${comparacion}.`;
}

// ---------- Comparado con otros días ----------

async function cargarHistorico() {
  try {
    const r = await fetch('/api/historico?dias=30');
    const datos = await r.json();
    estado.historico = Array.isArray(datos?.dias) && datos.dias.length ? datos.dias : null;
    aplicarZona();
  } catch {
    estado.historico = null;
  }
  pintarComparacion();
}

/** Días del histórico, más mañana si ya está publicado. Cada uno: { fecha, media, min, max }. */
function diasComparables() {
  const dias = [...estado.historico];
  const m = estado.manana;
  if (m?.disponible && !dias.some((d) => d.fecha === m.fecha)) {
    const p = m.horas.map((h) => h.precio);
    dias.push({ fecha: m.fecha, media: media(p), min: Math.min(...p), max: Math.max(...p) });
  }
  return dias;
}

function pintarComparacion() {
  const seccion = $('comparar');
  if (!estado.historico || !estado.hoy?.disponible) {
    seccion.hidden = true;
    return;
  }
  seccion.hidden = false;
  const dias = diasComparables();
  const iHoy = dias.findIndex((d) => d.fecha === estado.hoy.fecha);
  if (iHoy === -1) {
    seccion.hidden = true;
    return;
  }
  const hoy = dias[iHoy].media;
  const anteriores = dias.slice(0, iHoy);

  // "un 8 % menos que ayer": diferencia de hoy respecto a cada referencia.
  const frase = (referencia, nombre) => {
    if (referencia === undefined) return '';
    const dif = (hoy - referencia) / referencia;
    if (Math.abs(dif) < 0.02) return `<span class="delta igual">${icono('normal')}lo mismo que ${nombre}</span>`;
    return `<span class="delta ${dif > 0 ? 'sube' : 'baja'}">${icono(dif > 0 ? 'sube' : 'baja')}un ${numero(Math.abs(dif) * 100, 0)} % ${dif > 0 ? 'más' : 'menos'} que ${nombre}</span>`;
  };
  const ultimos = (n) => (anteriores.length ? media(anteriores.slice(-n).map((d) => d.media)) : undefined);
  const partes = [
    frase(anteriores.at(-1)?.media, 'ayer'),
    anteriores.length >= 7 ? frase(ultimos(7), 'la última semana') : '',
    anteriores.length >= 20 ? frase(ultimos(anteriores.length), 'el último mes') : '',
  ].filter(Boolean);
  $('comparaciones').innerHTML =
    `Hoy el kWh cuesta de media <strong>${cts(hoy)} céntimos</strong>${partes.length ? ':' : '.'}` +
    (partes.length ? `<span class="deltas">${partes.join('')}</span>` : '');

  pintarGraficoHistorico(dias, iHoy);
}

function pintarGraficoHistorico(dias, iHoy) {
  const cont = $('grafico-historico');
  const valores = dias.map((d) => d.media * 100 * factorImpuestos());
  const l = letras(valores);
  const W = Math.max(300, cont.clientWidth);
  const H = W < 560 ? 220 : 260;
  const m = { arriba: 34, abajo: 30, izquierda: 30 };
  const pw = W - m.izquierda;
  const ph = H - m.arriba - m.abajo;

  const maxV = Math.max(...valores);
  const paso = [2, 5, 10, 20, 50].find((p) => maxV / p <= 4) ?? 100;
  const tope = Math.ceil(maxV / paso) * paso;
  const y = (v) => m.arriba + ph * (1 - v / tope);
  const base = m.arriba + ph;
  const hueco = pw / dias.length;
  const ancho = Math.max(3, Math.min(20, hueco - 2));
  const centro = (i) => m.izquierda + i * hueco + hueco / 2;
  const fechaCorta = (f) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`));
  const fechaLarga = (f) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`));

  let svg = '';
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    svg += `<line class="${v === 0 ? 'base' : 'rejilla'}" x1="${m.izquierda}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="eje" x="${m.izquierda - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  // Media de los días anteriores, como referencia.
  const previos = valores.slice(0, iHoy);
  if (previos.length) {
    const yM = y(media(previos));
    svg += `<line class="linea-media" x1="${m.izquierda}" x2="${W}" y1="${yM}" y2="${yM}"/>`;
  }
  $('leyenda-historico').innerHTML = previos.length
    ? `<span class="muestra-linea"></span>Media del último mes: ${numero(media(previos), 1)} cts/kWh`
    : '';
  valores.forEach((v, i) => {
    const x = centro(i) - ancho / 2, arriba = y(v), r = Math.min(3, ancho / 2, base - arriba);
    const futuro = i > iHoy ? ' futuro' : '';
    svg += `<path class="barra${futuro}" data-i="${i}" style="fill: var(--${l[i]})" d="M${x},${base} V${arriba + r} Q${x},${arriba} ${x + r},${arriba} H${x + ancho - r} Q${x + ancho},${arriba} ${x + ancho},${arriba + r} V${base} Z"/>`;
  });
  // Etiquetas solo para hoy (y mañana).
  svg += `<path class="ahora-marca" d="M${centro(iHoy) - 5},${y(valores[iHoy]) - 12} h10 l-5,6 z"/>`;
  svg += `<text class="ahora-texto" x="${centro(iHoy)}" y="${y(valores[iHoy]) - 17}" text-anchor="middle">Hoy</text>`;
  if (iHoy + 1 < dias.length) {
    svg += `<text class="eje" x="${centro(iHoy + 1)}" y="${y(valores[iHoy + 1]) - 8}" text-anchor="middle">Mañana</text>`;
  }
  // Fechas cada 7 días contando desde hoy hacia atrás, para que hoy siempre tenga la suya.
  dias.forEach((d, i) => {
    if ((iHoy - i) % 7 === 0 && i <= iHoy) svg += `<text class="eje" x="${centro(i)}" y="${H - 6}" text-anchor="middle">${fechaCorta(d.fecha)}</text>`;
  });
  dias.forEach((d, i) => {
    const etiqueta = `${fechaLarga(d.fecha)}: ${numero(valores[i], 1)} céntimos de media`;
    svg += `<rect class="zona" data-i="${i}" tabindex="0" aria-label="${etiqueta}" x="${m.izquierda + i * hueco}" y="${m.arriba - 20}" width="${hueco}" height="${ph + 20}"/>`;
  });

  cont.querySelector('svg')?.remove();
  cont.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Precio medio de la luz de los últimos días">${svg}</svg>`);

  const tooltip = $('tooltip-historico');
  const mostrar = (i) => {
    cont.querySelectorAll('.barra.activa').forEach((b) => b.classList.remove('activa'));
    cont.querySelector(`.barra[data-i="${i}"]`).classList.add('activa');
    const fuerte = document.createElement('strong');
    fuerte.textContent = `${numero(valores[i], 1)} cts/kWh de media`;
    const detalle = document.createElement('span');
    const f = fechaLarga(dias[i].fecha);
    detalle.textContent = `${f[0].toUpperCase()}${f.slice(1)} · de ${cts(dias[i].min)} a ${cts(dias[i].max)}`;
    const datos = document.createElement('div');
    datos.append(fuerte, detalle);
    tooltip.replaceChildren(datos);
    tooltip.style.left = `${Math.min(W - 120, Math.max(120, centro(i)))}px`;
    tooltip.style.top = `${y(valores[i]) - (i === iHoy ? 24 : 0)}px`;
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

// ---------- Tu consumo real ----------
// El CSV se lee aquí, en el navegador: solo se piden a /api/precios los precios de los días que trae.

const MAX_DIAS_CONSUMO = 92;

function prepararConsumo() {
  const entrada = $('archivo-consumo');
  const zona = $('subida');
  entrada.addEventListener('change', () => entrada.files[0] && leerArchivoConsumo(entrada.files[0]));
  zona.addEventListener('dragover', (e) => {
    e.preventDefault();
    zona.classList.add('encima');
  });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('encima');
    const archivo = e.dataTransfer.files[0];
    if (archivo) leerArchivoConsumo(archivo);
  });
}

async function leerArchivoConsumo(archivo) {
  const salida = $('consumo-resultado');
  salida.hidden = false;
  salida.innerHTML = '<p class="consumo-estado">Leyendo el archivo…</p>';
  try {
    if (archivo.size > 20 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
    let filas = leerCsv(await archivo.text());
    const fechas = [...new Set(filas.map((f) => f.fecha))].sort();
    const usadas = fechas.slice(-MAX_DIAS_CONSUMO);
    filas = filas.filter((f) => f.fecha >= usadas[0]);

    salida.innerHTML = `<p class="consumo-estado">Cruzando tu consumo con los precios de ${usadas.length} ${usadas.length === 1 ? 'día' : 'días'}…</p>`;
    const dias = {};
    for (let i = 0; i < usadas.length; i += 6) {
      await Promise.all(usadas.slice(i, i + 6).map(async (f) => {
        const d = await cargar(f);
        if (d?.disponible) dias[f] = d.horas;
      }));
    }
    if (!Object.keys(dias).length) throw new Error('No he podido conseguir los precios de esos días. Prueba en un rato.');
    estado.consumo = { filas, dias, recortado: fechas.length > usadas.length, nombre: archivo.name };
    $('subida').hidden = true;
    pintarConsumo();
    $('consumo').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    salida.innerHTML = `<p class="consumo-error">${esc(e.message || 'No he podido leer el archivo.')}</p>`;
  }
  $('archivo-consumo').value = '';
}

function pintarConsumo() {
  if (!estado.consumo) return;
  const { filas, dias, recortado } = estado.consumo;
  const campo = estado.zona === 'ceutamelilla' ? 'precioCym' : 'precioPcb';
  const precios = Object.fromEntries(Object.entries(dias).map(([f, horas]) => [f, horas.map((h) => h[campo] ?? h.precio)]));
  const r = analizar(filas, precios, factorImpuestos());
  const salida = $('consumo-resultado');
  if (!r) {
    salida.innerHTML = '<p class="consumo-error">Las fechas del archivo no coinciden con días con precios publicados.</p>';
    return;
  }

  const fecha = (f) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${f}T12:00:00Z`));
  const kwh = (n) => `${numero(n, n < 10 ? 1 : 0)} kWh`;
  const dif = (r.precioPagado - r.precioMedio) / r.precioMedio;
  const veredicto = Math.abs(dif) < 0.02
    ? 'justo la media de esos días: repartes el consumo sin fijarte en la hora.'
    : dif > 0
      ? `un ${numero(dif * 100, 0)} % más que la media de esos días (${cts(r.precioMedio / factorImpuestos())} cts): gastas más de lo normal en horas caras.`
      : `un ${numero(-dif * 100, 0)} % menos que la media de esos días (${cts(r.precioMedio / factorImpuestos())} cts): ya consumes bastante en horas baratas.`;
  const pct = (n) => `${numero(n * 100, 0)} %`;

  salida.innerHTML = `
    <p class="consumo-resumen">
      Del ${fecha(r.desde)} al ${fecha(r.hasta)} (${r.dias} ${r.dias === 1 ? 'día' : 'días'}) consumiste <strong>${kwh(r.kwh)}</strong>,
      y su energía te costó <strong>${euros(r.coste)}</strong>${estado.impuestos ? ' con impuestos' : ' sin impuestos'}.
      ${recortado ? `<span class="consumo-nota">Solo he usado los últimos ${MAX_DIAS_CONSUMO} días del archivo.</span>` : ''}
    </p>
    <div class="consumo-bloques">
      <div class="consumo-bloque">
        <h3>A qué precio consumes</h3>
        <p>Pagaste de media <strong>${cts(r.precioPagado / factorImpuestos())} cts/kWh</strong>, ${veredicto}</p>
      </div>
      <div class="consumo-bloque">
        <h3>En qué horas consumes</h3>
        <div class="reparto" role="img" aria-label="${pct(r.reparto.barato)} en horas baratas, ${pct(r.reparto.medio)} en normales y ${pct(r.reparto.caro)} en caras">
          <span style="flex: ${r.reparto.barato}; background: var(--A)"></span>
          <span style="flex: ${r.reparto.medio}; background: var(--D)"></span>
          <span style="flex: ${r.reparto.caro}; background: var(--G)"></span>
        </div>
        <p class="reparto-leyenda">
          <span><i style="background: var(--A)"></i>${pct(r.reparto.barato)} baratas (A–B)</span>
          <span><i style="background: var(--D)"></i>${pct(r.reparto.medio)} normales</span>
          <span><i style="background: var(--G)"></i>${pct(r.reparto.caro)} caras (F–G)</span>
        </p>
      </div>
      <div class="consumo-bloque">
        <h3>Cuánto podrías ahorrar</h3>
        <p>Si cada día hubieras pasado a las horas más baratas lo que gastaste en tus 4 horas más caras, te habrías ahorrado
        hasta <strong>${euros(r.ahorro)}</strong>${r.coste ? ` (un ${numero((r.ahorro / r.coste) * 100, 0)} % de la energía)` : ''}.</p>
      </div>
    </div>
    <h3 class="consumo-subtitulo">Tu día típico</h3>
    <p class="seccion-sub">Lo que consumes de media en cada hora, con el color de su precio medio en esos días.</p>
    <div class="grafico grafico-consumo" id="grafico-consumo"><div class="tooltip" id="tooltip-consumo" role="status" hidden></div></div>
    <button type="button" class="enlace" id="consumo-otro">Analizar otro archivo</button>`;

  $('consumo-otro').addEventListener('click', () => {
    estado.consumo = null;
    $('consumo-resultado').hidden = true;
    $('subida').hidden = false;
    $('archivo-consumo').click();
  });
  pintarPerfilConsumo(r, dias);
}

/** Consumo medio por hora de reloj (en tu zona) y su precio medio. */
function pintarPerfilConsumo(r, dias) {
  const cont = $('grafico-consumo');
  const kwhHora = Array(24).fill(0), precioHora = Array(24).fill(0), nHora = Array(24).fill(0);
  for (const [fecha, horas] of r.porDia) {
    for (const h of horas) {
      const tramo = dias[fecha]?.[h.hora - 1];
      if (!tramo) continue;
      const reloj24 = horaIni(tramo) % 24;
      kwhHora[reloj24] += h.kwh;
      precioHora[reloj24] += h.precio;
      nHora[reloj24]++;
    }
  }
  const valores = kwhHora.map((k, i) => (nHora[i] ? k / nHora[i] : 0));
  const preciosMedios = precioHora.map((p, i) => (nHora[i] ? p / nHora[i] : 0));
  const l = letras(preciosMedios.map((p, i) => (nHora[i] ? p : Math.min(...preciosMedios.filter(Boolean)))));

  const W = Math.max(300, cont.clientWidth);
  const H = W < 560 ? 200 : 240;
  const m = { arriba: 24, abajo: 26, izquierda: 38 };
  const pw = W - m.izquierda, ph = H - m.arriba - m.abajo;
  const maxV = Math.max(...valores, 0.1);
  const paso = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2].find((p) => maxV / p <= 4) ?? 5;
  const tope = Math.ceil(maxV / paso) * paso;
  const y = (v) => m.arriba + ph * (1 - v / tope);
  const base = m.arriba + ph;
  const hueco = pw / 24, ancho = Math.min(22, hueco - 2);
  const centro = (i) => m.izquierda + i * hueco + hueco / 2;

  let svg = '';
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    svg += `<line class="${v === 0 ? 'base' : 'rejilla'}" x1="${m.izquierda}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="eje" x="${m.izquierda - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v, paso >= 1 ? 0 : Number.isInteger(Math.round(paso * 1000) / 100) ? 1 : 2)}</text>`;
  }
  svg += `<text class="eje" x="${m.izquierda - 8}" y="${m.arriba - 10}" text-anchor="end">kWh</text>`;
  valores.forEach((v, i) => {
    const x = centro(i) - ancho / 2, arriba = y(v), r2 = Math.min(4, ancho / 2, base - arriba);
    svg += `<path class="barra" data-i="${i}" style="fill: var(--${l[i]})" d="M${x},${base} V${arriba + r2} Q${x},${arriba} ${x + r2},${arriba} H${x + ancho - r2} Q${x + ancho},${arriba} ${x + ancho},${arriba + r2} V${base} Z"/>`;
  });
  const cada = hueco < 22 ? 6 : 3;
  for (let i = 0; i < 24; i += cada) svg += `<text class="eje" x="${centro(i)}" y="${H - 4}" text-anchor="middle">${i} h</text>`;
  valores.forEach((v, i) => {
    svg += `<rect class="zona" data-i="${i}" tabindex="0" aria-label="De ${i} a ${i + 1} h: ${numero(v, 2)} kWh de media, letra ${l[i]}" x="${m.izquierda + i * hueco}" y="${m.arriba}" width="${hueco}" height="${ph}"/>`;
  });
  cont.querySelector('svg')?.remove();
  cont.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tu consumo medio por horas">${svg}</svg>`);

  const tooltip = $('tooltip-consumo');
  const mostrar = (i) => {
    cont.querySelectorAll('.barra.activa').forEach((b) => b.classList.remove('activa'));
    cont.querySelector(`.barra[data-i="${i}"]`).classList.add('activa');
    const fuerte = document.createElement('strong');
    fuerte.textContent = `${numero(valores[i], 2)} kWh de media`;
    const detalle = document.createElement('span');
    detalle.textContent = `De ${reloj(i)} a ${reloj(i + 1)} · ${cts(preciosMedios[i])} cts/kWh`;
    const datos = document.createElement('div');
    datos.append(fuerte, detalle);
    tooltip.replaceChildren(datos);
    tooltip.style.left = `${Math.min(W - 110, Math.max(110, centro(i)))}px`;
    tooltip.style.top = `${y(valores[i])}px`;
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
