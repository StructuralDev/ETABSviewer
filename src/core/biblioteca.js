// Lee una biblioteca de perfiles de ETABS (carpeta "Property Libraries" de la instalación, p. ej.
// AISC14.xml). El .e2k solo guarda el nombre del perfil y el archivo (FILE "AISC14"); el área y
// las dimensiones están en esta biblioteca, que es la misma que usa ETABS. Sin acceso al DOM.

import { factorLongitudAM } from './unidades.js';

export class ErrorBiblioteca extends Error {}

// Elemento de la biblioteca -> forma de ETABS + nombres de sus dimensiones (peralte, ancho, alas, alma)
const TIPOS = {
  STEEL_BOX: { forma: 'Steel Tube', D: 'HT', B: 'B', TF: 'TF', TW: 'TW' },
  STEEL_I_SECTION: { forma: 'Steel I/Wide Flange', D: 'D', B: 'BF', TF: 'TF', TW: 'TW' },
  STEEL_PIPE: { forma: 'Steel Pipe', D: 'OD', B: null, TF: null, TW: 'TDES' },
  STEEL_CHANNEL: { forma: 'Steel Channel', D: 'D', B: 'BF', TF: 'TF', TW: 'TW' },
  // Sin contorno propio: el área sirve para el peso y se dibuja el rectángulo envolvente.
  STEEL_ANGLE: { forma: 'Steel Angle', D: 'D', B: 'B', TF: 'TF', TW: 'TW' },
  STEEL_TEE: { forma: 'Steel Tee', D: 'D', B: 'BF', TF: 'TF', TW: 'TW' },
  STEEL_DOUBLE_ANGLE: { forma: 'Steel Double Angle', D: 'D', B: 'B', TF: 'TF', TW: 'TW' },
};

const campo = (bloque, nombre) => {
  const m = new RegExp(`<${nombre}>\\s*([^<]*?)\\s*</${nombre}>`).exec(bloque);
  return m ? m[1] : null;
};

/**
 * @param {string} xml contenido del .xml de la biblioteca
 * @returns {{nombre:string, perfiles:Object<string,{forma:string, area_m2:number, D:number|null,
 *           B:number|null, TF:number|null, TW:number|null}>}} longitudes en m, área en m²
 */
export function parsearBibliotecaCsi(xml) {
  if (typeof xml !== 'string' || !xml.includes('<PROPERTY_FILE')) {
    throw new ErrorBiblioteca('El archivo no es una biblioteca de perfiles de CSI (falta <PROPERTY_FILE>).');
  }
  const unidad = campo(xml, 'LENGTH_UNITS');
  if (!unidad) throw new ErrorBiblioteca('La biblioteca no indica LENGTH_UNITS.');
  const f = factorLongitudAM(unidad);
  const perfiles = {};
  for (const [tipo, def] of Object.entries(TIPOS)) {
    for (const m of xml.matchAll(new RegExp(`<${tipo}>([\\s\\S]*?)</${tipo}>`, 'g'))) {
      const etiqueta = campo(m[1], 'LABEL');
      const area = Number(campo(m[1], 'A'));
      if (!etiqueta || !Number.isFinite(area) || area <= 0) continue;
      const dim = (k) => {
        const v = k ? Number(campo(m[1], k)) : NaN;
        return Number.isFinite(v) ? v * f : null;
      };
      perfiles[etiqueta] = {
        forma: def.forma,
        area_m2: area * f * f,
        D: dim(def.D), B: dim(def.B), TF: dim(def.TF), TW: dim(def.TW),
      };
    }
  }
  if (Object.keys(perfiles).length === 0) throw new ErrorBiblioteca('La biblioteca no contiene perfiles de acero.');
  return { nombre: campo(xml, 'DESCRIPTION') ?? '', perfiles };
}
