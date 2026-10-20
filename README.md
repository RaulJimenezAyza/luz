# Luz barata

Precio de la luz (PVPC) hora a hora y la mejor hora para poner cada aparato. Destino: **https://luz.reloda.es**.

## Cómo está hecho

Sin paso de compilación y a coste 0:

| Pieza | Qué es |
|---|---|
| `public/` | Web estática (HTML + JS + CSS) e instalable como PWA |
| `public/ventana.js` | Lógica pura: franja más barata (ventana deslizante), tramos barato/medio/caro |
| `functions/api/precios.js` | Cloudflare Pages Function: `GET /api/precios?fecha=AAAA-MM-DD` |
| `functions/api/historico.js` | `GET /api/historico?dias=30`: media, mínimo y máximo de cada día (para comparar) |
| `functions/api/avisos.js` | `POST`/`DELETE /api/avisos`: alta y baja de las notificaciones push (Cloudflare KV `AVISOS`) |
| `avisos/` | Worker con cron que cada tarde manda el push cuando salen los precios de mañana |
| `public/consumo.js` | Lee el CSV de consumo (Datadis o distribuidora) y lo cruza con los precios, todo en el navegador |
| `public/privacidad.html` | Página de privacidad |
| `lib/esios.js` | Lectura de Red Eléctrica y caché por día, compartida por las dos APIs |
| `lib/horario.js` | Convierte cada fila de Red Eléctrica en su instante real (días de 23, 24 y 25 horas) |
| `test/` | Tests con `node --test` (sin dependencias) |

**Datos:** archivo 70 de ESIOS (Red Eléctrica), público y **sin token**:
`https://api.esios.ree.es/archives/70/download_json?locale=es&date=AAAA-MM-DD`.
Campo `PCB` = Península, Canarias y Baleares, en €/MWh. Los de mañana salen hacia las 20:15.

> Las filas van **numeradas, no por hora de reloj**: el día del cambio de hora de octubre hay 25
> ("00-01" … "24-25") y el de marzo, 23. La API devuelve el `inicio` y el `fin` de cada hora en ms UTC
> y la web los pinta en la hora de la península o de Canarias (selector en el pie, se detecta solo).

> El mercado mayorista va por cuartos de hora desde octubre de 2025 (96 precios al día), pero el
> **PVPC se sigue publicando por horas** (24 precios). Por eso la web trabaja por horas.

**Impuestos:** por defecto los precios se muestran con impuesto eléctrico (5,11269632 %) e IVA (21 %),
o IGIC (0 %) en Canarias, o IPSI (1 %) en Ceuta y Melilla (que además tienen su propio precio, `CYM`); vigentes desde el 1 de junio de 2026. Están en `IMPUESTO_ELECTRICO` e `IVA` al
principio de `public/app.js`: si el Gobierno los cambia, se tocan ahí.

## Uso

```bash
npm install
npm run dev      # http://localhost:8788 (web + función, como en Cloudflare)
npm test
```

## Publicar en luz.reloda.es (una vez)

1. `npx wrangler login` (abre el navegador con tu cuenta de Cloudflare).
2. `npm run deploy`: la primera vez crea el proyecto `luz-reloda` y lo publica en `https://luz-reloda.pages.dev`.
3. En Cloudflare → Workers & Pages → `luz-reloda` → *Custom domains* → añadir `luz.reloda.es`.
4. En **DonDominio** (donde está el DNS de reloda.es), crear un registro
   `CNAME  luz  →  luz-reloda.pages.dev`. No hace falta mover el dominio a Cloudflare: así no se toca
   nada de `reloda.es`, `app.reloda.es` ni `trinidad.reloda.es` (Firebase).

El despliegue se hace desde tu PC con wrangler: **no gasta minutos de GitHub Actions**.

## Avisos (notificaciones push)

- El navegador se suscribe con la clave pública VAPID (en `public/app.js` y `avisos/wrangler.toml`).
- El Worker `luz-avisos` salta cada 10 min de 18:00 a 20:50 UTC; cuando mañana ya está publicado manda un
  push vacío a cada suscripción (lotes de 40) y el service worker (`public/sw.js`) escribe el aviso.
- Publicar el Worker: `npx wrangler deploy --config avisos/wrangler.toml`.
- Secretos del Worker (no están en el repositorio): `VAPID_PRIVADA` (JWK) y `CLAVE_PRUEBA`.
  Con esta última, `GET https://luz-avisos.dimelo-game.workers.dev/probar?clave=…` manda los avisos al momento.
- En iPhone solo funciona con la web añadida a la pantalla de inicio (iOS 16.4 o posterior).

## Siguientes pasos

- [ ] Publicar en luz.reloda.es
- [ ] Service worker para que funcione sin conexión
- [ ] Aviso push diario ("mañana lo más barato es de 14 a 16 h") con un Worker con cron a las 20:30
- [ ] Datadis: consumo real y "cuánto podrías haber ahorrado"
- [ ] Enchufes inteligentes / Home Assistant
- [ ] Simulador de placas solares con la curva de consumo real
