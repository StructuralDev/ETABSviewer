// Cifrado de paquetes de modelos con contraseña, usando solo Web Crypto (navegador y Node 20+).
//   clave = PBKDF2-HMAC-SHA256(contraseña, sal, ITERACIONES) -> AES-256-GCM
//   datos = gzip(JSON) cifrado; el paquete publicado solo contiene sal, iv y texto cifrado.
// Como el repositorio de GitHub Pages es público, la seguridad depende de la contraseña:
// se exige una longitud mínima y se recomienda una frase larga distinta por cliente.

export class ErrorCripto extends Error {}

// OWASP Password Storage Cheat Sheet (2023): PBKDF2-HMAC-SHA256 con 600 000 iteraciones.
export const ITERACIONES_PBKDF2 = 600_000;
export const LONGITUD_MINIMA_CONTRASENA = 14;
const LONGITUD_SAL = 16; // bytes
const LONGITUD_IV = 12; // bytes

const enc = new TextEncoder();
const dec = new TextDecoder();

// Unicode NFC: la misma contraseña con acentos o ñ da la misma clave sin importar el sistema donde se teclee.
const normaliza = (c) => String(c ?? '').normalize('NFC');

const DEBILES = /^(?:(.)+|0123456789+|1234567890+|password|contrase[nñ]a|qwerty|abc123)/i;

const aB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};
const deB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function flujoABytes(flujo) {
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}
const comprimir = (bytes) =>
  flujoABytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
const descomprimir = (bytes) =>
  flujoABytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));

async function derivarClave(contrasena, sal, iteraciones) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normaliza(contrasena)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function cifrarPaquete(paquete, contrasena, iteraciones = ITERACIONES_PBKDF2) {
  if (typeof contrasena !== 'string' || normaliza(contrasena).length < LONGITUD_MINIMA_CONTRASENA) {
    throw new ErrorCripto(`La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`);
  }
  if (DEBILES.test(contrasena) || new Set(contrasena).size < 6) {
    throw new ErrorCripto('La contraseña es demasiado predecible: usa la generada o una frase larga con palabras poco comunes.');
  }
  const sal = crypto.getRandomValues(new Uint8Array(LONGITUD_SAL));
  const iv = crypto.getRandomValues(new Uint8Array(LONGITUD_IV));
  const clave = await derivarClave(contrasena, sal, iteraciones);
  const plano = await comprimir(enc.encode(JSON.stringify(paquete)));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, plano));
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: iteraciones,
    alg: 'AES-256-GCM',
    sal: aB64(sal),
    iv: aB64(iv),
    datos: aB64(cifrado),
  };
}

export async function descifrarPaquete(sobre, contrasena) {
  if (!sobre || sobre.v !== 1 || sobre.kdf !== 'PBKDF2-SHA256' || sobre.alg !== 'AES-256-GCM') {
    throw new ErrorCripto('Formato de paquete no reconocido.');
  }
  if (!Number.isInteger(sobre.iter) || sobre.iter < 100_000 || sobre.iter > 5_000_000) {
    throw new ErrorCripto('Parámetros de derivación de clave fuera de rango.');
  }
  let cifrado;
  try {
    const sal = deB64(sobre.sal), iv = deB64(sobre.iv);
    if (sal.length !== LONGITUD_SAL || iv.length !== LONGITUD_IV) throw new Error('longitudes');
    const clave = await derivarClave(contrasena, sal, sobre.iter);
    cifrado = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, clave, deB64(sobre.datos));
  } catch {
    // GCM autentica: contraseña errónea o archivo alterado fallan igual, sin distinguir.
    throw new ErrorCripto('Contraseña incorrecta o archivo dañado.');
  }
  return JSON.parse(dec.decode(await descomprimir(new Uint8Array(cifrado))));
}
