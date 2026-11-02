// Construye el modelo del visor a partir de lo leído del .e2k:
// geometría en metros, propiedades de sección y cantidades por elemento.
// Salida: longitudes en m, áreas en m², volúmenes en m³, pesos en kg. Sin acceso al DOM.

import { factorLongitudAM, pesoVolumetricoAKgM3 } from './unidades.js';

export class ErrorModelo extends Error {}

const TOL_VERTICAL = 1e-6;

// ---------- Geometría de secciones ----------

const normaForma = (s) => String(s ?? '').toLowerCase();

// Área (m²) de la sección calculada con sus dimensiones nominales (sin radios de
// acuerdo en perfiles laminados: subestima ~1-3 % el área de un W real).
// `d` = dimensiones ya convertidas a m. Devuelve null si la forma no está soportada.
export function areaDeSeccion(forma, d) {
  const f = normaForma(forma);
  if (f.includes('wide flange') || f.includes('i/wide')) {
    return 2 * d.BF * d.TF + (d.D - 2 * d.TF) * d.TW;
  }
  if (f.includes('tube') || f.includes('box')) {
    return d.B * d.D - (d.B - 2 * d.TW) * (d.D - 2 * d.TF);
  }
  if (f.includes('pipe')) {
    return (Math.PI / 4) * (d.D ** 2 - (d.D - 2 * d.TW) ** 2);
  }
  if (f.includes('channel')) {
    return 2 * d.B * d.TF + (d.D - 2 * d.TF) * d.TW;
  }
  if (f.includes('circle') || f.includes('rod')) {
    return (Math.PI / 4) * d.D ** 2;
  }
  if (f.includes('rectangular') || f.includes('plate')) {
    return d.B * d.D;
  }
  return null;
}

function circulo(radio, n = 24) {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return [radio * Math.cos(a), radio * Math.sin(a)];
  });
}

// Contorno (y huecos) en ejes locales de la sección: u a lo largo del eje local 3
// (ancho) y v a lo largo del eje local 2 (peralte), centrado en el centro geométrico.
export function perfilDeSeccion(forma, d) {
  const f = normaForma(forma);
  const rect = (b, h) => [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];
  if (f.includes('wide flange') || f.includes('i/wide')) {
    const a = d.BF / 2, w = d.TW / 2, h = d.D / 2, hi = h - d.TF;
    return { contorno: [
      [-a, -h], [a, -h], [a, -hi], [w, -hi], [w, hi], [a, hi],
      [a, h], [-a, h], [-a, hi], [-w, hi], [-w, -hi], [-a, -hi],
    ], huecos: [] };
  }
  if (f.includes('tube') || f.includes('box')) {
    return { contorno: rect(d.B, d.D), huecos: [rect(d.B - 2 * d.TW, d.D - 2 * d.TF)] };
  }
  if (f.includes('pipe')) {
    return { contorno: circulo(d.D / 2), huecos: [circulo(d.D / 2 - d.TW)] };
  }
  if (f.includes('channel')) {
    const b = d.B, h = d.D / 2, hi = h - d.TF, w = d.TW;
    const x0 = -b / 2;
    return { contorno: [
      [x0, -h], [x0 + b, -h], [x0 + b, -hi], [x0 + w, -hi],
      [x0 + w, hi], [x0 + b, hi], [x0 + b, h], [x0, h],
    ], huecos: [] };
  }
  if (f.includes('circle') || f.includes('rod')) {
    return { contorno: circulo(d.D / 2), huecos: [] };
  }
  if (f.includes('rectangular') || f.includes('plate')) {
    return { contorno: rect(d.B, d.D), huecos: [] };
  }
  return null;
}

// Dimensiones solo para DIBUJAR secciones HSS rectangulares de catálogo (p. ej. "HSS8X8X1/4",
// medidas nominales en pulgadas) cuando no hay tabla de ETABS. No se usan para cantidades.
export function dimensionesVisualesPorNombre(nombre) {
  const mm = /^HSS(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)X(\d+\/\d+|\d*\.\d+)$/i.exec(nombre);
  if (!mm) return null;
  const pulg = 0.0254;
  const [num, den] = mm[3].includes('/') ? mm[3].split('/').map(Number) : [Number(mm[3]), 1];
  const t = (num / den) * pulg;
  return { forma: 'Steel Tube', D: Number(mm[1]) * pulg, B: Number(mm[2]) * pulg, TF: t, TW: t };
}

// ---------- Álgebra mínima 3D ----------

const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norma = (a) => Math.hypot(a[0], a[1], a[2]);
const unitario = (a) => {
  const n = norma(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const escala = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const suma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// Área de un polígono plano en 3D (método de Newell).
export function areaPoligono3d(pts) {
  let s = [0, 0, 0];
  for (let k = 0; k < pts.length; k++) {
    s = suma(s, cruz(pts[k], pts[(k + 1) % pts.length]));
  }
  return norma(s) / 2;
}

// Ejes locales de un frame según la convención de ETABS.
// e1 sigue el eje del elemento (de i a j). Si no es vertical, e2 queda en el plano
// vertical que contiene a e1 apuntando hacia arriba (+Z) y e3 = e1 × e2. Si es
// vertical, e2 = +X. `angGrados` gira e2/e3 alrededor de e1 (regla de la mano derecha).
export function ejesLocales(i, j, angGrados = 0) {
  const e1 = unitario(resta(j, i));
  let e2;
  if (Math.hypot(e1[0], e1[1]) < TOL_VERTICAL) {
    e2 = [1, 0, 0];
  } else {
    const z = [0, 0, 1];
    e2 = unitario(resta(z, escala(e1, e1[2])));
  }
  const e3 = cruz(e1, e2);
  const a = (angGrados * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return {
    e1,
    e2: suma(escala(e2, c), escala(e3, s)),
    e3: suma(escala(e2, -s), escala(e3, c)),
  };
}

// ---------- Construcción del modelo ----------

const r = (x, dec) => Number(x.toFixed(dec));
const redondea3 = (p) => [r(p[0], 4), r(p[1], 4), r(p[2], 4)];

function clasificaMaterial(tipo) {
  const t = String(tipo ?? '').toLowerCase();
  if (t.includes('steel')) return 'acero';
  if (t.includes('concrete')) return 'concreto';
  return 'otro';
}

/**
 * @param {object} e2k   resultado de parsearE2k
 * @param {object} [opc]
 * @param {string} [opc.nombre]
 * @param {Object} [opc.tablaSecciones] tabla "Frame Section Properties" de ETABS (ver tabla.js), por nombre de sección
 * @param {Object<string,{perfiles:Object}>} [opc.bibliotecas] bibliotecas de perfiles de ETABS (ver biblioteca.js)
 *        por nombre de archivo (p. ej. AISC14). Para secciones de catálogo, el área sale de aquí.
 */
export function construirModelo(e2k, opc = {}) {
  const avisos = [];
  const lf = factorLongitudAM(e2k.unidades.longitud);
  const m = (v) => v * lf; // longitud del archivo -> m

  // Pisos: elevación de cada nivel (parte superior del piso), en m.
  const pisosTop = e2k.pisos; // de arriba hacia abajo
  const elev = new Array(pisosTop.length);
  const ib = pisosTop.length - 1;
  // ETABS escribe ELEV en el piso base; se acepta también ELEVATION.
  const elevDe = (p) => (typeof p.ELEV === 'number' ? p.ELEV : p.ELEVATION);
  if (typeof elevDe(pisosTop[ib]) !== 'number') {
    throw new ErrorModelo('El piso inferior (Base) no tiene ELEV en $ STORIES.');
  }
  elev[ib] = m(elevDe(pisosTop[ib]));
  for (let k = ib - 1; k >= 0; k--) {
    if (typeof elevDe(pisosTop[k]) === 'number') elev[k] = m(elevDe(pisosTop[k]));
    else if (typeof pisosTop[k].HEIGHT === 'number') elev[k] = elev[k + 1] + m(pisosTop[k].HEIGHT);
    else throw new ErrorModelo(`El piso "${pisosTop[k].nombre}" no tiene HEIGHT ni ELEV.`);
  }
  const idxPiso = Object.fromEntries(pisosTop.map((p, k) => [p.nombre, k]));
  const zPiso = (nombre, ctx) => {
    if (!(nombre in idxPiso)) throw new ErrorModelo(`Piso desconocido "${nombre}" en ${ctx}.`);
    return elev[idxPiso[nombre]];
  };
  const zNiveles = (nombre, nNiveles, ctx) => {
    const k = Math.min(idxPiso[nombre] + nNiveles, pisosTop.length - 1);
    if (idxPiso[nombre] + nNiveles > pisosTop.length - 1) {
      avisos.push(`${ctx}: baja más pisos de los que existen; se limitó a la base.`);
    }
    return elev[k];
  };

  // Materiales.
  const materiales = {};
  for (const [nombre, mat] of Object.entries(e2k.materiales)) {
    const clase = clasificaMaterial(mat.TYPE);
    let peso = null;
    if (typeof mat.WEIGHTPERVOLUME === 'number') {
      peso = pesoVolumetricoAKgM3(mat.WEIGHTPERVOLUME, e2k.unidades.fuerza, e2k.unidades.longitud);
    }
    materiales[nombre] = { clase, pesoVolumetrico_kgm3: peso === null ? null : r(peso, 3) };
  }

  // Secciones de frame. Las de catálogo (AISC...) no traen dimensiones ni área en el
  // .e2k: se completan con la tabla "Frame Section Properties" de ETABS (opc.tablaSecciones).
  const tabla = opc.tablaSecciones ?? {};
  const bibliotecas = Object.fromEntries(Object.entries(opc.bibliotecas ?? {}).map(([k, v]) => [k.toUpperCase(), v]));
  const secciones = {};
  for (const [nombre, s] of Object.entries(e2k.secciones)) {
    // Sección de catálogo: el .e2k trae solo el nombre del perfil; el área está en la biblioteca de ETABS.
    const sinDimensiones = !['D', 'B', 'BF', 'TF', 'TW'].some((k) => typeof s[k] === 'number');
    const delCatalogo = sinDimensiones ? bibliotecas[String(s.FILE ?? '').toUpperCase()]?.perfiles?.[s.SHAPE] ?? null : null;
    const t = delCatalogo ?? tabla[nombre] ?? null;
    const forma = String(t?.forma || s.SHAPE || '');
    const dim = {};
    for (const k of ['D', 'B', 'BF', 'TF', 'TW']) if (typeof s[k] === 'number') dim[k] = m(s[k]);
    if (t) {
      for (const k of ['D', 'B', 'TF', 'TW']) if (dim[k] === undefined && t[k] !== null) dim[k] = t[k];
      if (dim.BF === undefined && t.B !== null) dim.BF = t.B;
    }
    let area = areaDeSeccion(forma, dim);
    let perfil = perfilDeSeccion(forma, dim);
    // Dimensiones incompletas (p. ej. la tabla Summary solo trae el área): sin valores numéricos.
    if (!Number.isFinite(area)) area = null;
    if (perfil && !perfil.contorno.flat().every(Number.isFinite)) perfil = null;
    let origenArea = area === null ? null : 'dimensiones';
    if (typeof t?.area_m2 === 'number' && t.area_m2 > 0) {
      area = t.area_m2; // área de ETABS (incluye radios de acuerdo)
      origenArea = delCatalogo ? 'biblioteca' : 'tabla';
    }
    if (perfil === null) {
      // Solo para dibujar: perfil de catálogo por nombre o rectángulo envolvente.
      const v = dimensionesVisualesPorNombre(nombre, lf) ?? (dim.D && dim.B ? dim : null);
      if (v) perfil = perfilDeSeccion(v.forma ?? 'rectangular', v);
    }
    if (area === null || !Number.isFinite(area) || area <= 0) {
      area = null;
      origenArea = null;
      const pista = sinDimensiones && s.FILE
        ? `carga la biblioteca "${s.FILE}" (ETABS, carpeta Property Libraries) o la tabla Frame Section Properties`
        : 'falta la tabla Frame Section Properties o la forma no está soportada';
      avisos.push(`Sección "${nombre}": sin área (${pista}); se dibuja sin peso ni volumen.`);
    }
    secciones[nombre] = {
      material: t?.material || s.MATERIAL || null,
      forma,
      area_m2: area === null ? null : r(area, 8),
      origenArea,
      perfil: perfil && {
        contorno: perfil.contorno.map(([u, v]) => [r(u, 5), r(v, 5)]),
        huecos: perfil.huecos.map((h) => h.map(([u, v]) => [r(u, 5), r(v, 5)])),
      },
    };
  }

  // Propiedades de áreas (losas, muros).
  const propsArea = {};
  for (const [nombre, p] of Object.entries(e2k.propsArea)) {
    const esp = [p.SLABTHICKNESS, p.WALLTHICKNESS, p.THICKNESS].find((v) => typeof v === 'number');
    propsArea[nombre] = {
      material: p.MATERIAL ?? null,
      tipo: p.PROPTYPE ?? null,
      espesor_m: esp === undefined ? null : r(m(esp), 5),
    };
    if (esp === undefined) avisos.push(`Propiedad de área "${nombre}" sin espesor reconocible; sin volumen.`);
  }

  const claseDe = (nombreMat) => materiales[nombreMat]?.clase ?? 'otro';
  const pesoDe = (nombreMat, volumen_m3) => {
    if (claseDe(nombreMat) !== 'acero') return null;
    const g = materiales[nombreMat]?.pesoVolumetrico_kgm3;
    if (g === null || g === undefined) {
      avisos.push(`Material "${nombreMat}" sin peso volumétrico; no se calcula el peso.`);
      return null;
    }
    return volumen_m3 * g;
  };

  // Frames.
  const frames = [];
  for (const [id, ln] of Object.entries(e2k.lineas)) {
    const asign = e2k.asignLineas[id];
    if (!asign) { avisos.push(`Línea "${id}" sin asignación; omitida.`); continue; }
    for (const a of asign) { // ETABS escribe un LINEASSIGN por cada piso del objeto
      const pi = e2k.puntos[ln.i], pj = e2k.puntos[ln.j];
      if (!pi || !pj) { avisos.push(`Línea "${id}" con punto inexistente; omitida.`); continue; }
      const ctx = `Línea "${id}"`;
      let zi, zj;
      if (ln.tipo === 'COLUMN') {
        zj = zPiso(a.piso, ctx);
        zi = zNiveles(a.piso, Math.max(1, ln.nPisos || 1), ctx);
      } else if (ln.tipo === 'BRACE') {
        // SUPUESTO por validar con ETABS: el extremo I está en el nivel inferior y el J en el
        // superior (en el modelo de prueba las diagonales forman un zigzag continuo).
        zj = zPiso(a.piso, ctx);
        zi = zNiveles(a.piso, Math.max(1, ln.nPisos || 1), ctx);
      } else {
        zi = zj = zPiso(a.piso, ctx);
      }
      const I = [m(pi.x), m(pi.y), pi.z === null ? zi : m(pi.z)];
      const J = [m(pj.x), m(pj.y), pj.z === null ? zj : m(pj.z)];
      const L = norma(resta(J, I));
      if (L < 1e-9) { avisos.push(`${ctx}: longitud nula; omitida.`); continue; }
      const sec = secciones[a.SECTION];
      if (!sec) { avisos.push(`${ctx}: sección "${a.SECTION}" desconocida.`); }
      const area = sec?.area_m2 ?? null;
      const volumen = area === null ? null : area * L;
      const peso = volumen === null ? null : pesoDe(sec.material, volumen);
      frames.push({
        uid: `${id}|${a.piso}`,
        id,
        tipo: ln.tipo === 'COLUMN' ? 'columna' : ln.tipo === 'BRACE' ? 'contraviento' : 'viga',
        piso: a.piso,
        seccion: a.SECTION ?? null,
        material: sec?.material ?? null,
        clase: claseDe(sec?.material),
        i: redondea3(I),
        j: redondea3(J),
        ang_grados: typeof a.ANG === 'number' ? a.ANG : 0,
        longitud_m: r(L, 4),
        area_m2: area,
        volumen_m3: volumen === null ? null : r(volumen, 6),
        peso_kg: peso === null ? null : r(peso, 3),
      });
    }
  }

  // Áreas.
  const areas = [];
  for (const [id, ar] of Object.entries(e2k.areas)) {
    const asign = e2k.asignAreas[id];
    if (!asign) { avisos.push(`Área "${id}" sin asignación; omitida.`); continue; }
    for (const a of asign) {
      const ctx = `Área "${id}"`;
      const xy = [];
      for (const p of ar.puntos) {
        const pt = e2k.puntos[p];
        if (!pt) { avisos.push(`${ctx} con punto inexistente; omitida.`); xy.length = 0; break; }
        xy.push([m(pt.x), m(pt.y)]);
      }
      if (xy.length < 3) continue;
      let pts;
      if (ar.tipo === 'PANEL') {
        // Muro: los puntos repetidos (arriba/abajo) se reducen a los vértices únicos en planta.
        const unicos = [];
        for (const q of xy) if (!unicos.some((u) => Math.hypot(u[0] - q[0], u[1] - q[1]) < 1e-6)) unicos.push(q);
        if (unicos.length !== 2) { avisos.push(`${ctx}: muro con ${unicos.length} vértices en planta; no soportado, omitido.`); continue; }
        const zt = zPiso(a.piso, ctx), zb = zNiveles(a.piso, 1, ctx);
        const [p, q] = unicos;
        pts = [[p[0], p[1], zb], [q[0], q[1], zb], [q[0], q[1], zt], [p[0], p[1], zt]];
      } else {
        const z = zPiso(a.piso, ctx);
        pts = xy.map(([x, y]) => [x, y, z]);
      }
      const prop = propsArea[a.SECTION];
      if (!prop) avisos.push(`${ctx}: propiedad "${a.SECTION}" desconocida.`);
      const A = areaPoligono3d(pts);
      const esp = prop?.espesor_m ?? null;
      const volumen = esp === null ? null : A * esp;
      const peso = volumen === null ? null : pesoDe(prop.material, volumen);
      areas.push({
        uid: `${id}|${a.piso}`,
        id,
        tipo: ar.tipo === 'PANEL' ? 'muro' : ar.tipo === 'RAMP' ? 'rampa' : 'losa',
        piso: a.piso,
        seccion: a.SECTION ?? null,
        material: prop?.material ?? null,
        clase: claseDe(prop?.material),
        pts: pts.map(redondea3),
        area_m2: r(A, 6),
        espesor_m: esp,
        volumen_m3: volumen === null ? null : r(volumen, 6),
        peso_kg: peso === null ? null : r(peso, 3),
      });
    }
  }

  // Ejes (grid lines) de ETABS. Solo sistemas cartesianos sin rotación.
  const ejes = [];
  for (const g of e2k.ejes) {
    const sis = e2k.sistemasEjes[g.sistema] ?? {};
    const dir = String(g.DIR ?? '').toUpperCase();
    if ((sis.TYPE && String(sis.TYPE).toUpperCase() !== 'CARTESIAN') || (typeof sis.ROTATION === 'number' && sis.ROTATION !== 0)) {
      avisos.push(`Sistema de ejes "${g.sistema}" no cartesiano o girado: no se dibujan sus ejes.`);
      continue;
    }
    if ((dir !== 'X' && dir !== 'Y') || typeof g.COORD !== 'number') continue;
    // Los nombres XORIGIN/YORIGIN son un supuesto (el modelo de prueba no tiene origen desplazado).
    const origen = dir === 'X' ? sis.XORIGIN : sis.YORIGIN;
    ejes.push({
      sistema: g.sistema,
      etiqueta: String(g.LABEL ?? ''),
      dir, // X: línea en x = coord (letras); Y: línea en y = coord (números)
      coord_m: r(m(g.COORD + (typeof origen === 'number' ? origen : 0)), 4),
    });
  }

  if (frames.length + areas.length === 0) {
    throw new ErrorModelo('No se pudo construir ningún elemento del modelo.');
  }
  avisos.push('No se consideran offsets de extremos ni zonas rígidas; las longitudes son entre nodos.');

  const suma_ = (arr, k) => arr.reduce((s, e) => s + (e[k] ?? 0), 0);
  const todos = [...frames, ...areas];
  return {
    version: 1,
    nombre: opc.nombre ?? 'Modelo',
    unidades: { longitud: 'm', area: 'm²', volumen: 'm³', peso: 'kg' },
    pisos: pisosTop.map((p, k) => ({ nombre: p.nombre, elevacion_m: r(elev[k], 4) })).reverse(),
    materiales,
    secciones,
    ejes,
    frames,
    areas,
    totales: {
      peso_acero_kg: r(suma_(todos.filter((e) => e.clase === 'acero'), 'peso_kg'), 2),
      volumen_concreto_m3: r(suma_(todos.filter((e) => e.clase === 'concreto'), 'volumen_m3'), 4),
    },
    avisos: [...new Set(avisos)],
  };
}
