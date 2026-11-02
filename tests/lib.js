// Mini corredor de pruebas sin dependencias: sirve en Node (`node --test tests/`) y en el
// navegador (tests/index.html). En Node, un fallo deja process.exitCode = 1.
export const resultados = [];

export function cerca(real, esperado, tol, msg = '') {
  if (!(Math.abs(real - esperado) <= tol)) {
    throw new Error(`${msg} esperado ${esperado} ± ${tol}, obtenido ${real}`);
  }
}
export function igual(real, esperado, msg = '') {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    throw new Error(`${msg} esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(real)}`);
  }
}
export async function lanza(fn, patron, msg = '') {
  try { await fn(); } catch (e) {
    if (patron && !patron.test(e.message)) throw new Error(`${msg} mensaje inesperado: ${e.message}`);
    return;
  }
  throw new Error(`${msg} se esperaba una excepción`);
}

export async function prueba(nombre, fn) {
  try {
    await fn();
    resultados.push({ nombre, ok: true });
    console.log(`ok   - ${nombre}`);
  } catch (e) {
    resultados.push({ nombre, ok: false, error: e.message });
    console.log(`FALLA - ${nombre}\n       ${e.message}`);
    if (typeof process !== 'undefined') process.exitCode = 1;
  }
}

// Lee un archivo de tests/fixtures (fs en Node, fetch en el navegador).
export async function leerFixture(nombre) {
  const url = new URL(`./fixtures/${nombre}`, import.meta.url);
  if (typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return readFile(url, 'utf8');
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo leer ${nombre}`);
  return r.text();
}
