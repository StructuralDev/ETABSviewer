// Gestión de un paquete ya construido: renombrar, reordenar, quitar o agregar modelos y editar la
// presentación (etiquetas, colores, notas) que ve el cliente. Todas las funciones devuelven un
// paquete nuevo y no tocan el original. Sin acceso al DOM.
//
// Presentación opcional por modelo (modelo.meta); los paquetes anteriores no la traen y siguen abriendo:
//   { nota, colorPor, colores: { <criterio>: { <valor>: '#rrggbb' } },
//     alias: { pisos: { <piso>: texto }, ejes: { <sistema|dir|etiqueta>: texto } } }

import { COLOR_HEX, IDS_CRITERIO } from './colores.js';

export class ErrorGestor extends Error {}

export const LIMITES = { nota: 2000, nombre: 80, aliasPiso: 40, aliasEje: 6 };

// Quita caracteres de control (menos salto de línea y tabulación), recorta y limita la longitud.
const limpia = (texto, max, { saltos = false } = {}) => {
  const s = String(texto ?? '')
    .replace(saltos ? /[\u0000-\u0008\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
    .trim();
  return s.slice(0, max);
};

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function sanearMapa(mapa, max) {
  const out = {};
  if (!esObjeto(mapa)) return out;
  for (const [k, v] of Object.entries(mapa)) {
    const t = limpia(v, max);
    if (t) out[k] = t;
  }
  return out;
}

/**
 * Deja la presentación de un modelo en su forma válida: descarta lo desconocido, los colores que no
 * son #rrggbb y los textos vacíos o demasiado largos. Devuelve undefined si no queda nada.
 */
export function sanearMeta(meta) {
  if (!esObjeto(meta)) return undefined;
  const out = {};
  const nota = limpia(meta.nota, LIMITES.nota, { saltos: true });
  if (nota) out.nota = nota;
  if (IDS_CRITERIO.includes(meta.colorPor) && meta.colorPor !== 'clase') out.colorPor = meta.colorPor;
  if (esObjeto(meta.colores)) {
    const colores = {};
    for (const criterio of IDS_CRITERIO) {
      const mapa = meta.colores[criterio];
      if (!esObjeto(mapa)) continue;
      const validos = Object.fromEntries(Object.entries(mapa).filter(([, c]) => COLOR_HEX.test(c)).map(([v, c]) => [v, c.toLowerCase()]));
      if (Object.keys(validos).length) colores[criterio] = validos;
    }
    if (Object.keys(colores).length) out.colores = colores;
  }
  if (esObjeto(meta.alias)) {
    const pisos = sanearMapa(meta.alias.pisos, LIMITES.aliasPiso);
    const ejes = sanearMapa(meta.alias.ejes, LIMITES.aliasEje);
    if (Object.keys(pisos).length || Object.keys(ejes).length) {
      out.alias = {};
      if (Object.keys(pisos).length) out.alias.pisos = pisos;
      if (Object.keys(ejes).length) out.alias.ejes = ejes;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

const conModelos = (paquete, modelos) => ({ ...paquete, modelos });

function indiceValido(paquete, k) {
  if (!Number.isInteger(k) || k < 0 || k >= paquete.modelos.length) throw new ErrorGestor(`No existe el modelo ${k + 1}.`);
}

export function renombrarPaquete(paquete, nombre) {
  return { ...paquete, nombre: limpia(nombre, LIMITES.nombre) };
}

// Nota general del paquete; vacía = sin nota.
export function fijarNotaPaquete(paquete, texto) {
  const { nota: _anterior, ...resto } = paquete;
  const nota = limpia(texto, LIMITES.nota, { saltos: true });
  return nota ? { ...resto, nota } : resto;
}

export function renombrarModelo(paquete, k, nombre) {
  indiceValido(paquete, k);
  return conModelos(paquete, paquete.modelos.map((m, i) => (i === k ? { ...m, nombre: limpia(nombre, LIMITES.nombre) } : m)));
}

// Mueve el modelo de la posición `desde` a `hasta` (base 0): [A, B, C], 2 -> 0 deja [C, A, B].
export function moverModelo(paquete, desde, hasta) {
  indiceValido(paquete, desde);
  indiceValido(paquete, hasta);
  const modelos = [...paquete.modelos];
  const [m] = modelos.splice(desde, 1);
  modelos.splice(hasta, 0, m);
  return conModelos(paquete, modelos);
}

export function quitarModelo(paquete, k) {
  indiceValido(paquete, k);
  return conModelos(paquete, paquete.modelos.filter((_, i) => i !== k));
}

// El modelo nuevo va al final.
export function agregarModelo(paquete, modelo) {
  return conModelos(paquete, [...paquete.modelos, modelo]);
}

// Reemplaza la presentación completa del modelo k (la sanea; vacía la elimina).
export function fijarMeta(paquete, k, meta) {
  indiceValido(paquete, k);
  return conModelos(paquete, paquete.modelos.map((m, i) => {
    if (i !== k) return m;
    const { meta: _anterior, ...resto } = m;
    const nueva = sanearMeta(meta);
    return nueva ? { ...resto, meta: nueva } : resto;
  }));
}

// Antes de sellar: nombres presentes y al menos un modelo.
export function validarPaquete(paquete) {
  if (!String(paquete?.nombre ?? '').trim()) throw new ErrorGestor('Falta el nombre del paquete.');
  if (!Array.isArray(paquete.modelos) || paquete.modelos.length === 0) throw new ErrorGestor('El paquete debe tener al menos un modelo.');
  paquete.modelos.forEach((m, k) => {
    if (!String(m?.nombre ?? '').trim()) throw new ErrorGestor(`El modelo ${k + 1} no tiene nombre.`);
    if (!Array.isArray(m.frames) || !Array.isArray(m.areas)) throw new ErrorGestor(`El modelo ${k + 1} no tiene el formato esperado.`);
  });
  return paquete;
}

// ---------- Etiquetas visibles (solo presentación: la geometría y las elevaciones no cambian) ----------

export const claveEje = (eje) => `${eje.sistema}|${eje.dir}|${eje.etiqueta}`;

// Lee solo claves propias: un piso llamado "constructor" no debe traer el de Object.prototype.
export const propio = (mapa, clave) => (mapa && Object.hasOwn(mapa, clave) ? mapa[clave] : undefined);

export const etiquetaDePiso = (modelo, piso) => propio(modelo.meta?.alias?.pisos, piso) ?? piso;
export const etiquetaDeEje = (modelo, eje) => propio(modelo.meta?.alias?.ejes, claveEje(eje)) ?? eje.etiqueta;
