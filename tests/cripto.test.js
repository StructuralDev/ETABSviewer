import { prueba, igual, lanza } from './lib.js';
import { cifrarPaquete, descifrarPaquete } from '../src/core/cripto.js';

const ITER = 100_000; // mínimo aceptado al descifrar; en producción se usan 600 000
const paquete = { nombre: 'Cliente X', modelos: [{ nombre: 'Torre', frames: [1, 2, 3] }] };
const clave = 'frase-larga-de-prueba-ñandú';

await prueba('cifrar y descifrar devuelve el mismo paquete', async () => {
  const sobre = await cifrarPaquete(paquete, clave, ITER);
  igual(await descifrarPaquete(sobre, clave), paquete);
});

await prueba('el sobre no contiene el contenido en claro', async () => {
  const sobre = await cifrarPaquete(paquete, clave, ITER);
  const s = JSON.stringify(sobre);
  igual(s.includes('Cliente X') || s.includes('Torre'), false);
});

await prueba('contraseña incorrecta falla', async () => {
  const sobre = await cifrarPaquete(paquete, clave, ITER);
  await lanza(() => descifrarPaquete(sobre, 'otra-frase-distinta'), /incorrecta/);
});

await prueba('archivo alterado falla (autenticación GCM)', async () => {
  const sobre = await cifrarPaquete(paquete, clave, ITER);
  const bytes = atob(sobre.datos).split('');
  bytes[5] = String.fromCharCode(bytes[5].charCodeAt(0) ^ 1);
  await lanza(() => descifrarPaquete({ ...sobre, datos: btoa(bytes.join('')) }, clave), /incorrecta|dañado/);
});

await prueba('contraseña corta se rechaza al cifrar', async () => {
  await lanza(() => cifrarPaquete(paquete, 'corta', ITER), /al menos 14/);
  await lanza(() => cifrarPaquete(paquete, 'a'.repeat(20), ITER), /predecible/);
  await lanza(() => cifrarPaquete(paquete, 'password12345678', ITER), /predecible/);
});

await prueba('dos cifrados del mismo paquete difieren (sal e iv aleatorios)', async () => {
  const a = await cifrarPaquete(paquete, clave, ITER);
  const b = await cifrarPaquete(paquete, clave, ITER);
  igual(a.datos === b.datos || a.sal === b.sal || a.iv === b.iv, false);
});

await prueba('parámetros de KDF fuera de rango se rechazan', async () => {
  const sobre = await cifrarPaquete(paquete, clave, ITER);
  await lanza(() => descifrarPaquete({ ...sobre, iter: 1 }, clave), /fuera de rango/);
  await lanza(() => descifrarPaquete({ v: 2 }, clave), /no reconocido/);
});

await prueba('la contraseña con acentos se normaliza (NFC): "ñ" compuesta y descompuesta abren igual', async () => {
  const compuesta = 'frase-larga-con-ñandu-2024'; // ñ como un solo carácter
  const descompuesta = 'frase-larga-con-ñandu-2024'; // n + tilde combinante
  const sobre = await cifrarPaquete(paquete, compuesta, ITER);
  igual(await descifrarPaquete(sobre, descompuesta), paquete);
});

await prueba('sal o iv con longitud incorrecta se rechazan', async () => {
  const sobre = await cifrarPaquete(paquete, clave, ITER);
  await lanza(() => descifrarPaquete({ ...sobre, iv: btoa('corto') }, clave), /incorrecta|dañado/);
});
