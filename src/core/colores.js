// Colores por categoría para el visor: "Color por" material, tipo, sección, piso. Sin acceso al DOM.
// Las categorías se ordenan de forma determinista (piso: por elevación; el resto: alfabético con
// números en orden natural) y se les asigna la paleta en ese orden, así el mismo modelo se ve igual
// siempre. Un color propio (meta.colores) tiene prioridad sobre el automático.

export const CRITERIOS = [
  { id: 'clase', etiqueta: 'Acero / concreto' },
  { id: 'tipo', etiqueta: 'Tipo de elemento' },
  { id: 'seccion', etiqueta: 'Sección' },
  { id: 'material', etiqueta: 'Material de ETABS' },
  { id: 'piso', etiqueta: 'Piso' },
];
export const IDS_CRITERIO = CRITERIOS.map((c) => c.id);

// Tonos de ALBA-ds (azul, verde, rojo suave, cian) más violeta, rosa, lima y arena para tener 8
// categorías distinguibles sobre fondo oscuro. Se evita el naranja: es el color de la selección.
export const PALETA = ['#2C8FD0', '#78BE4B', '#E5736F', '#A98BE8', '#3CC8C8', '#E06BB5', '#C8D84B', '#D9B38C'];

export const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

const SIN_DATO = '—';
const ordenNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function valorDeColor(e, criterio) {
  switch (criterio) {
    case 'clase': return e.clase ?? 'otro';
    case 'tipo': return e.tipo ?? SIN_DATO;
    case 'seccion': return e.seccion ?? SIN_DATO;
    case 'material': return e.material ?? SIN_DATO;
    case 'piso': return e.piso ?? SIN_DATO;
    default: throw new Error(`Criterio de color desconocido: ${criterio}`);
  }
}

/**
 * Leyenda del modelo para un criterio.
 * @param {object} modelo modelo del paquete (frames, areas, pisos)
 * @param {string} criterio uno de IDS_CRITERIO
 * @param {Object<string,string>} [propios] colores elegidos por el usuario, por valor ("#rrggbb")
 * @param {Object<string,string>} [base] colores de partida por valor (los del visor para "clase")
 * @returns {Array<{valor:string, color:string, n:number, propio:boolean}>}
 */
export function leyenda(modelo, criterio, propios, base) {
  propios ??= {};
  base ??= {};
  const cuenta = new Map();
  for (const e of [...modelo.frames, ...modelo.areas]) {
    const v = valorDeColor(e, criterio);
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  let valores = [...cuenta.keys()];
  if (criterio === 'piso') {
    const orden = new Map((modelo.pisos ?? []).map((p, k) => [p.nombre, k]));
    valores.sort((a, b) => (orden.get(a) ?? Infinity) - (orden.get(b) ?? Infinity) || ordenNatural.compare(a, b));
  } else {
    valores.sort(ordenNatural.compare);
  }
  // Claves propias solamente: una sección llamada "constructor" no debe traer algo de Object.prototype.
  const de = (mapa, valor) => (Object.hasOwn(mapa, valor) ? mapa[valor] : undefined);
  return valores.map((valor, k) => {
    const elegido = COLOR_HEX.test(de(propios, valor) ?? '');
    return {
      valor,
      color: elegido ? propios[valor] : (de(base, valor) ?? PALETA[k % PALETA.length]),
      n: cuenta.get(valor),
      propio: elegido,
    };
  });
}
