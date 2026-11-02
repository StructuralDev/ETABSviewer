// Bibliotecas de perfiles de ETABS ya leídas, guardadas en este navegador (IndexedDB) para no
// tener que volver a elegirlas en cada conversión. Nunca se suben a ningún servidor.
import { expandirBiblioteca } from '../core/biblioteca.js';

const BD = 'visor-etabs';
const TIENDA = 'bibliotecas';

function abrir() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TIENDA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function operar(modo, fn) {
  const bd = await abrir();
  try {
    return await new Promise((ok, mal) => {
      const tx = bd.transaction(TIENDA, modo);
      const req = fn(tx.objectStore(TIENDA));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => mal(tx.error);
    });
  } finally {
    bd.close();
  }
}

export const guardarBiblioteca = (nombre, datos) => operar('readwrite', (t) => t.put(datos, nombre.toUpperCase()));
export const borrarBiblioteca = (nombre) => operar('readwrite', (t) => t.delete(nombre.toUpperCase()));

export async function leerBibliotecas() {
  const [claves, valores] = await Promise.all([operar('readonly', (t) => t.getAllKeys()), operar('readonly', (t) => t.getAll())]);
  return Object.fromEntries(claves.map((k, i) => [k, valores[i]]));
}

const NOMBRE_VALIDO = /^[A-Za-z0-9._-]+$/;

/**
 * Devuelve { NOMBRE: biblioteca } para los archivos pedidos: primero las que el usuario cargó en
 * este navegador y, si faltan, las incluidas en data/perfiles/. Las que no se encuentran se omiten
 * (el modelo avisa qué sección quedó sin peso).
 */
export async function obtenerBibliotecas(nombres) {
  let propias = {};
  try { propias = await leerBibliotecas(); } catch { /* IndexedDB no disponible */ }
  const out = {};
  for (const n of nombres) {
    if (propias[n]) { out[n] = propias[n]; continue; }
    if (!NOMBRE_VALIDO.test(n)) continue;
    try {
      const r = await fetch(`data/perfiles/${n}.json`);
      if (r.ok) out[n] = expandirBiblioteca(await r.json());
    } catch { /* sin biblioteca incluida para este nombre */ }
  }
  return out;
}
