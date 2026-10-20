// Firma VAPID (RFC 8292) para Web Push: un JWT ES256 que demuestra al servicio push (Google, Apple…)
// que el aviso lo manda el dueño de la clave pública con la que se suscribió el navegador.

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const texto = (obj) => base64url(new TextEncoder().encode(JSON.stringify(obj)));

let clavePrivada; // se importa una vez por instancia del Worker

/**
 * Cabecera Authorization para un servicio push.
 * @param {string} audiencia origen del endpoint, p. ej. "https://fcm.googleapis.com"
 * @param {string} publica clave pública VAPID (base64url, 65 bytes sin comprimir)
 * @param {string} privadaJwk clave privada VAPID en JWK (secreto del Worker)
 */
export async function firmaVapid(audiencia, publica, privadaJwk) {
  clavePrivada ??= await crypto.subtle.importKey('jwk', JSON.parse(privadaJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cabecera = texto({ typ: 'JWT', alg: 'ES256' });
  const datos = texto({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://luz.reloda.es' });
  // WebCrypto ya devuelve la firma ECDSA como r||s (64 bytes), que es el formato que pide JWS.
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clavePrivada, new TextEncoder().encode(`${cabecera}.${datos}`));
  return `vapid t=${cabecera}.${datos}.${base64url(firma)}, k=${publica}`;
}
