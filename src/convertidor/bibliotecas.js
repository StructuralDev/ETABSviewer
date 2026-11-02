// Bibliotecas de perfiles de ETABS ya leídas, guardadas en este navegador (IndexedDB) para no
// tener que volver a elegirlas en cada conversión. Nunca se suben a ningún servidor.
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
