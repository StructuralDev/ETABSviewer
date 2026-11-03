// Bibliotecas de perfiles de ETABS (carpeta "Property Libraries" de la instalación del propio usuario).
// Se leen en este navegador y las ya leídas se guardan en IndexedDB para no volver a elegirlas.
// No se suben a ningún servidor ni se incluyen en el repositorio (son de CSI).
import { parsearBibliotecaCsi } from '../core/biblioteca.js';

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

/**
 * Devuelve { NOMBRE: biblioteca } para los archivos pedidos: primero las guardadas en este navegador
 * y, si faltan, las que haya en `archivos` (Map NOMBRE -> File de la carpeta Property Libraries que
 * eligió el usuario), que se leen y se guardan para la próxima vez. Las que no se encuentran se omiten:
 * quien llama compara contra `nombres` para avisar qué falta.
 */
export async function obtenerBibliotecas(nombres, archivos = new Map(), { leerArchivo = (f) => f.text() } = {}) {
  let guardadas = {};
  try { guardadas = await leerBibliotecas(); } catch { /* IndexedDB no disponible: solo se usa lo que haya en la carpeta */ }
  const out = {};
  for (const n of nombres) {
    if (guardadas[n]) { out[n] = guardadas[n]; continue; }
    const archivo = archivos.get(n);
    if (!archivo) continue;
    out[n] = parsearBibliotecaCsi(await leerArchivo(archivo));
    try { await guardarBiblioteca(n, out[n]); } catch { /* sin IndexedDB: se vuelve a leer la próxima vez */ }
  }
  return out;
}

// Nombres de bibliotecas que el modelo usa y que no están disponibles.
export const bibliotecasFaltantes = (usadas, disponibles) => usadas.filter((n) => !disponibles[n]);
