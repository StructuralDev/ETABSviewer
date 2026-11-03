// Arma el paquete de modelos de un cliente: lee los archivos de ETABS, construye cada modelo
// y lo cifra. Es la única ruta de salida del convertidor. Sin acceso al DOM.

import { parsearE2k } from './e2k.js';
import { parsearTablaSecciones, parsearTablaDeHojas } from './tabla.js';
import { construirModelo } from './modelo.js';
import { cifrarPaquete } from './cripto.js';

export class ErrorPaquete extends Error {}

/**
 * @param {string} nombre nombre del paquete (cliente o proyecto)
 * @param {Array<{nombre:string, e2k:string, tabla?:string, hojasTabla?:Array<{nombre:string,filas:string[][]}>, unidadTabla?:string}>} entradas
 *        la tabla de secciones viene como texto (`tabla`) o como hojas de un .xlsx (`hojasTabla`)
 * @param {Object} [bibliotecas] bibliotecas de perfiles ya leídas, por nombre de archivo (ver biblioteca.js)
 * @returns {{nombre:string, modelos:object[]}}
 */
export function construirPaquete(nombre, entradas, bibliotecas = {}) {
  if (!String(nombre ?? '').trim()) throw new ErrorPaquete('Falta el nombre del paquete.');
  if (!Array.isArray(entradas) || entradas.length === 0) throw new ErrorPaquete('Agrega al menos un modelo.');
  const modelos = entradas.map((en, k) => construirModeloDeEntrada(en, k, bibliotecas));
  return { nombre: nombre.trim(), modelos };
}

/**
 * Construye un solo modelo a partir de sus archivos (mismas entradas que construirPaquete).
 * @param {number} k posición del modelo en el paquete; solo se usa para el nombre por omisión ("Modelo k+1")
 */
export function construirModeloDeEntrada(en, k, bibliotecas = {}) {
  const etiqueta = en.nombre?.trim() || `Modelo ${k + 1}`;
  try {
    const unidad = en.unidadTabla ?? 'M';
    const tablaSecciones = en.hojasTabla
      ? parsearTablaDeHojas(en.hojasTabla, unidad)
      : en.tabla ? parsearTablaSecciones(en.tabla, unidad) : undefined;
    return construirModelo(parsearE2k(en.e2k), { nombre: etiqueta, tablaSecciones, bibliotecas });
  } catch (e) {
    throw new ErrorPaquete(`${etiqueta}: ${e.message}`);
  }
}

// Devuelve el sobre cifrado listo para guardarse como models/<id>.enc.json.
export function sellarPaquete(paquete, contrasena) {
  return cifrarPaquete(paquete, contrasena);
}

// Identificador aleatorio para la URL (no revela el nombre del cliente).
export function generarIdPaquete() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Contraseña aleatoria de 4 grupos de 4 caracteres (~91 bits), sin símbolos ambiguos (0/O, 1/l/I).
// Muestreo por rechazo: sin sesgo hacia los primeros caracteres del alfabeto.
export function generarContrasena() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const limite = 256 - (256 % alfabeto.length);
  const c = [];
  while (c.length < 16) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limite && c.length < 16) c.push(alfabeto[b % alfabeto.length]);
    }
  }
  return [0, 4, 8, 12].map((i) => c.slice(i, i + 4).join('')).join('-');
}

// Nombres de las bibliotecas de perfiles que usa un .e2k (valores de FILE en $ FRAME SECTIONS).
export function bibliotecasUsadas(textoE2k) {
  const e2k = parsearE2k(textoE2k);
  return [...new Set(Object.values(e2k.secciones).map((s) => s.FILE).filter(Boolean).map((f) => String(f).toUpperCase()))];
}
