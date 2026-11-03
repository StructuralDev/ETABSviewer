// Totales de un conjunto de elementos (selección o modelo completo). Sin acceso al DOM.
// Acero -> peso (kg); concreto y demás -> volumen (m³).

import { valorDeColor } from './colores.js';

export function resumir(elementos) {
  const r = {
    n: elementos.length,
    porTipo: {},
    longitud_m: 0, // suma de longitudes de frames
    area_m2: 0, // suma de áreas de losas y muros
    peso_acero_kg: 0,
    volumen_acero_m3: 0,
    volumen_concreto_m3: 0,
    volumen_otro_m3: 0,
    sinCantidad: 0, // elementos sin área de sección o sin espesor (no suman peso/volumen)
  };
  for (const e of elementos) {
    r.porTipo[e.tipo] = (r.porTipo[e.tipo] ?? 0) + 1;
    if (typeof e.longitud_m === 'number') r.longitud_m += e.longitud_m;
    if (e.pts && typeof e.area_m2 === 'number') r.area_m2 += e.area_m2;
    if (e.volumen_m3 === null || e.volumen_m3 === undefined) {
      r.sinCantidad++;
      continue;
    }
    if (e.clase === 'acero') {
      r.volumen_acero_m3 += e.volumen_m3;
      r.peso_acero_kg += e.peso_kg ?? 0;
    } else if (e.clase === 'concreto') r.volumen_concreto_m3 += e.volumen_m3;
    else r.volumen_otro_m3 += e.volumen_m3;
  }
  return r;
}

// Volumen de todos los materiales (acero incluido): es la suma de la columna "Vol." de la tabla.
export const volumenTotal_m3 = (r) => r.volumen_acero_m3 + r.volumen_concreto_m3 + r.volumen_otro_m3;

const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/**
 * Subtotales por categoría (mismos criterios que "Color por": clase, tipo, seccion, material, piso).
 * @param {object[]} elementos
 * @param {string} criterio
 * @param {{pisos?: string[]}} [opciones] pisos: nombres de abajo hacia arriba, para ordenar el criterio "piso"
 * @returns {Array<{valor:string, resumen:ReturnType<typeof resumir>}>} un subtotal por categoría, en orden estable;
 *          la suma de los subtotales es igual a resumir(elementos)
 */
export function agruparPor(elementos, criterio, { pisos = [] } = {}) {
  const grupos = new Map();
  for (const e of elementos) {
    const v = valorDeColor(e, criterio);
    if (!grupos.has(v)) grupos.set(v, []);
    grupos.get(v).push(e);
  }
  const valores = [...grupos.keys()];
  if (criterio === 'piso') {
    const lugar = (p) => { const k = pisos.indexOf(p); return k < 0 ? Infinity : k; };
    valores.sort((a, b) => lugar(a) - lugar(b) || ordenNatural.compare(a, b));
  } else {
    valores.sort(ordenNatural.compare);
  }
  return valores.map((valor) => ({ valor, resumen: resumir(grupos.get(valor)) }));
}
