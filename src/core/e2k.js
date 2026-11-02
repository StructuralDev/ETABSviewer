// Lector del archivo de texto .e2k de ETABS (File > Export > ETABS .e2k File).
// Devuelve los datos tal cual vienen, en las unidades del archivo; la conversión
// a metros/kg se hace en modelo.js. Sin acceso al DOM.
//
// Sintaxis supuesta (pendiente de validar contra un .e2k real, ver CLAUDE.md):
//   - secciones que empiezan con "$ NOMBRE"
//   - registros de una línea: PALABRA "id" ... con pares CLAVE valor
//   - texto entre comillas dobles; comentarios con "$" al inicio de la línea

export class ErrorE2k extends Error {}

// Divide una línea en tokens; conserva si venían entre comillas.
export function tokenizar(linea) {
  const tokens = [];
  const re = /"((?:[^"]|"")*)"|(\S+)/g;
  let m;
  while ((m = re.exec(linea)) !== null) {
    if (m[1] !== undefined) tokens.push({ v: m[1].replace(/""/g, '"'), q: true });
    else tokens.push({ v: m[2], q: false });
  }
  return tokens;
}

// Convierte tokens [desde..] en pares CLAVE -> valor (la clave es un token sin comillas).
function paresClaveValor(tokens, desde) {
  const out = {};
  for (let i = desde; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.q || /^[-+]?[\d.]/.test(t.v)) continue;
    const sig = tokens[i + 1];
    if (sig === undefined) {
      out[t.v.toUpperCase()] = true;
    } else {
      out[t.v.toUpperCase()] = sig.q ? sig.v : numeroOTexto(sig.v);
      i++;
    }
  }
  return out;
}

function numeroOTexto(s) {
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== '' ? n : s;
}

function aNumero(t, contexto) {
  const n = Number(t?.v);
  if (!Number.isFinite(n)) throw new ErrorE2k(`Número inválido en ${contexto}: "${t?.v}"`);
  return n;
}

export function parsearE2k(texto) {
  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new ErrorE2k('El archivo .e2k está vacío.');
  }
  const m = {
    unidades: null, // { fuerza, longitud }
    pisos: [], // en orden de arriba hacia abajo, como en el archivo
    materiales: {},
    secciones: {},
    propsArea: {},
    puntos: {},
    lineas: {},
    areas: {},
    asignLineas: {},
    asignAreas: {},
  };

  let seccion = '';
  for (const crudo of texto.split(/\r?\n/)) {
    const linea = crudo.trim();
    if (linea === '') continue;
    if (linea.startsWith('$')) {
      seccion = linea.replace(/^\$+\s*/, '').toUpperCase();
      continue;
    }
    const t = tokenizar(linea);
    const palabra = t[0].v.toUpperCase();

    if (seccion.startsWith('CONTROLS') && palabra === 'UNITS') {
      m.unidades = { fuerza: t[1]?.v, longitud: t[2]?.v };
    } else if (seccion.startsWith('STORIES') && palabra === 'STORY') {
      m.pisos.push({ nombre: t[1].v, ...paresClaveValor(t, 2) });
    } else if (seccion.startsWith('MATERIAL PROPERTIES') && palabra === 'MATERIAL') {
      const nombre = t[1].v;
      m.materiales[nombre] = { ...(m.materiales[nombre] ?? {}), ...paresClaveValor(t, 2) };
    } else if (seccion.startsWith('FRAME SECTIONS') && palabra === 'FRAMESECTION') {
      const nombre = t[1].v;
      m.secciones[nombre] = { ...(m.secciones[nombre] ?? {}), ...paresClaveValor(t, 2) };
    } else if (seccion.startsWith('SHELL PROPERTIES') && palabra === 'SHELLPROP') {
      const nombre = t[1].v;
      m.propsArea[nombre] = { ...(m.propsArea[nombre] ?? {}), ...paresClaveValor(t, 2) };
    } else if (seccion.startsWith('POINT COORDINATES') && palabra === 'POINT') {
      const x = aNumero(t[2], `POINT ${t[1].v}`);
      const y = aNumero(t[3], `POINT ${t[1].v}`);
      const z = t[4] && !t[4].q && Number.isFinite(Number(t[4].v)) ? Number(t[4].v) : null;
      m.puntos[t[1].v] = { x, y, z };
    } else if (seccion.startsWith('LINE CONNECTIVITIES') && palabra === 'LINE') {
      m.lineas[t[1].v] = {
        tipo: t[2].v.toUpperCase(), // BEAM | COLUMN | BRACE
        i: t[3].v,
        j: t[4].v,
        nPisos: t[5] ? Number(t[5].v) : 0,
      };
    } else if (seccion.startsWith('AREA CONNECTIVITIES') && palabra === 'AREA') {
      const n = aNumero(t[3], `AREA ${t[1].v}`);
      m.areas[t[1].v] = {
        tipo: t[2].v.toUpperCase(), // FLOOR | PANEL | RAMP
        puntos: t.slice(4, 4 + n).map((p) => p.v),
      };
    } else if (seccion.startsWith('LINE ASSIGNS') && palabra === 'LINEASSIGN') {
      (m.asignLineas[t[1].v] ??= []).push({ piso: t[2].v, ...paresClaveValor(t, 3) });
    } else if (seccion.startsWith('AREA ASSIGNS') && palabra === 'AREAASSIGN') {
      (m.asignAreas[t[1].v] ??= []).push({ piso: t[2].v, ...paresClaveValor(t, 3) });
    }
  }

  if (!m.unidades) throw new ErrorE2k('No se encontró la línea UNITS en $ CONTROLS.');
  if (m.pisos.length === 0) throw new ErrorE2k('No se encontraron pisos ($ STORIES).');
  if (Object.keys(m.lineas).length + Object.keys(m.areas).length === 0) {
    throw new ErrorE2k('El archivo no contiene elementos de línea ni de área.');
  }
  return m;
}
