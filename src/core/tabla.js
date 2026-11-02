// Lee la tabla "Frame Section Properties" exportada de ETABS (texto/CSV, separada por
// tabulador, coma o punto y coma). El .e2k no trae área ni dimensiones de las secciones de
// catálogo (AISC, etc.), así que esta tabla es la fuente del peso del acero.
//
// ETABS: Display > Show Tables > Model Definition > Section Properties > Frame Section
// Properties; luego File > Export > To CSV/Text.
//
// Acepta texto (CSV/TSV) o las filas ya leídas de un .xlsx (ver xlsx.js). La hoja de Excel de
// ETABS ("Frame Prop - Summary") trae título, encabezado, una fila de unidades ("cm²") y datos.
//
// Columnas usadas (por nombre de encabezado): Name, Material, Shape, Area y, si existen,
// t3, t2, tf, tw. t3 = peralte (eje local 2), t2 = ancho (eje local 3).
// La tabla "Summary" solo trae Area: con ella basta para el peso.
// OJO: ETABS redondea el área a los decimales que muestre la tabla (p. ej. 0.1 cm²); aumenta la
// precisión de la tabla en ETABS si necesitas más exactitud en el peso.

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
 * @param {string|string[][]} entrada texto CSV/TSV o filas de una hoja de Excel
 * @param {string} [unidadLongitud='M'] unidad de las columnas de longitud si la tabla no la indica
 * @returns {Object<string,{material:string|null, forma:string|null, area_m2:number|null,
 *           D:number|null, B:number|null, TF:number|null, TW:number|null}>} dimensiones en m
 */
export function parsearTablaSecciones(entrada, unidadLongitud = 'M') {
  let filas;
  if (Array.isArray(entrada)) {
    filas = entrada.map((f) => f.map((c) => String(c ?? '').trim())).filter((f) => f.some((c) => c !== ''));
  } else {
    const lineas = String(entrada ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lineas.length < 2) throw new ErrorTabla('La tabla de secciones está vacía.');
    const sep = detectaSeparador(lineas);
    filas = lineas.map((l) => celdas(l, sep));
  }
  if (filas.length < 2) throw new ErrorTabla('La tabla de secciones está vacía.');

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

// Busca entre las hojas de un libro de Excel la que contiene la tabla de secciones.
export function parsearTablaDeHojas(hojas, unidadLongitud = 'M') {
  for (const h of hojas) {
    try {
      return parsearTablaSecciones(h.filas, unidadLongitud);
    } catch (e) {
      if (!(e instanceof ErrorTabla)) throw e;
    }
  }
  throw new ErrorTabla('Ninguna hoja del Excel tiene una tabla con las columnas "Name" y "Area".');
}
