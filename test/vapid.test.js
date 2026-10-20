import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaVapid } from '../avisos/src/vapid.js';

test('la firma VAPID es un JWT ES256 que se verifica con la clave pública', async () => {
  const { subtle } = globalThis.crypto;
  const par = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = Buffer.from(await subtle.exportKey('raw', par.publicKey)).toString('base64url');
  const privada = JSON.stringify(await subtle.exportKey('jwk', par.privateKey));

  const cabecera = await firmaVapid('https://fcm.googleapis.com', publica, privada);
  const [, jwt, k] = cabecera.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publica);

  const [h, d, f] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const datos = JSON.parse(Buffer.from(d, 'base64url'));
  assert.equal(datos.aud, 'https://fcm.googleapis.com');
  assert.ok(datos.exp > Date.now() / 1000);

  const valida = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, par.publicKey, Buffer.from(f, 'base64url'), new TextEncoder().encode(`${h}.${d}`)
  );
  assert.equal(valida, true);
});
