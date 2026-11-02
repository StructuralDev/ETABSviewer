// Lee la tabla "Frame Section Properties" exportada de ETABS (texto/CSV, separada por
// tabulador, coma o punto y coma). El .e2k no trae área ni dimensiones de las secciones de
// catálogo (AISC, etc.), así que esta tabla es la fuente del peso del acero.
//
// ETABS: Display > Show Tables > Model Definition > Section Properties > Frame Section
// Properties; luego File > Export > To CSV/Text.
//
// Columnas usadas (por nombre de encabezado): Name, Material, Shape, t3, t2, tf, tw, Area.
// t3 = peralte (a lo largo del eje local 2), t2 = ancho (eje local 3).

import { factorLongitudAM } from './unidades.js';

export class ErrorTabla extends Error {}

function celdas(linea, sep) {
  const out = [];
  let cur = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') { cur += '"'; i++; } else comillas = !comillas;
    } else if (c === sep && !comillas) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function detectaSeparador(lineas) {
  const cand = ['\t', ';', ','];
  let mejor = cand[0], maxCols = 0;
  for (const s of cand) {
    const n = Math.max(...lineas.slice(0, 20).map((l) => celdas(l, s).length));
    if (n > maxCols) { maxCols = n; mejor = s; }
  }
  return mejor;
}

const numero = (s) => {
  const n = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : null;
};

/**
 * @param {string} texto
 * @param {string} [unidadLongitud='M'] unidad de las columnas de longitud si la tabla no la indica
 * @returns {Object<string,{material:string|null, forma:string|null, area_m2:number|null,
 *           D:number|null, B:number|null, TF:number|null, TW:number|null}>} dimensiones en m
 */
export function parsearTablaSecciones(texto, unidadLongitud = 'M') {
  const lineas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) throw new ErrorTabla('La tabla de secciones está vacía.');
  const sep = detectaSeparador(lineas);
  const filas = lineas.map((l) => celdas(l, sep));

  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const iEnc = filas.findIndex((f) => f.map(norm).includes('name') && f.map(norm).includes('area'));
  if (iEnc < 0) throw new ErrorTabla('No se encontró un encabezado con las columnas "Name" y "Area".');
  const enc = filas[iEnc].map(norm);
  const col = (nombre) => enc.indexOf(nombre);
  const c = { name: col('name'), mat: col('material'), forma: col('shape'),
    t3: col('t3'), t2: col('t2'), tf: col('tf'), tw: col('tw'), area: col('area') };

  // Fila de unidades opcional justo debajo del encabezado (p. ej. "m", "m²").
  let inicio = iEnc + 1;
  let uLong = unidadLongitud;
  const filaU = filas[inicio] ?? [];
  const mArea = /^(mm|cm|m|in|ft)\s*(²|2|\^2)$/i.exec(filaU[c.area] ?? '');
  if (mArea) {
    uLong = mArea[1];
    inicio++;
  }
  const f = factorLongitudAM(uLong);

  const out = {};
  for (const fila of filas.slice(inicio)) {
    const nombre = fila[c.name];
    if (!nombre) continue;
    const dim = (i) => (i < 0 ? null : numero(fila[i]));
    const area = dim(c.area);
    const mm = (v) => (v === null ? null : v * f);
    out[nombre] = {
      material: c.mat < 0 ? null : fila[c.mat] || null,
      forma: c.forma < 0 ? null : fila[c.forma] || null,
      area_m2: area === null ? null : area * f * f,
      D: mm(dim(c.t3)), B: mm(dim(c.t2)), TF: mm(dim(c.tf)), TW: mm(dim(c.tw)),
    };
  }
  if (Object.keys(out).length === 0) throw new ErrorTabla('La tabla no contiene secciones.');
  return out;
}
