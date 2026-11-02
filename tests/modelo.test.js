// Casos de verificación de cantidades. Los valores esperados se calcularon A MANO
// (derivación en cada comentario); no se obtienen ejecutando el código probado.
import { prueba, cerca, igual, lanza, leerFixture } from './lib.js';
import { parsearE2k } from '../src/core/e2k.js';
import { construirModelo, areaDeSeccion, areaPoligono3d, ejesLocales } from '../src/core/modelo.js';
import { factorLongitudAM, factorFuerzaAKgf } from '../src/core/unidades.js';

const texto = await leerFixture('modelo-simple.e2k');
const modelo = construirModelo(parsearE2k(texto), { nombre: 'prueba' });
const frame = (id) => modelo.frames.find((f) => f.id === id);
const area = (id) => modelo.areas.find((a) => a.id === id);

// --- Cantidades del modelo sintético (unidades kgf, m) ---

await prueba('pisos: elevaciones de abajo hacia arriba', () => {
  // Base 0; Story1 = 0 + 4 = 4; Story2 = 4 + 3 = 7
  igual(modelo.pisos, [
    { nombre: 'Base', elevacion_m: 0 },
    { nombre: 'Story1', elevacion_m: 4 },
    { nombre: 'Story2', elevacion_m: 7 },
  ]);
});

await prueba('viga W de acero 6 m: área, volumen y peso', () => {
  // A = 2·bf·tf + (d − 2tf)·tw = 2(0.15)(0.01) + (0.30 − 0.02)(0.006) = 0.003 + 0.00168 = 0.00468 m²
  // V = 0.00468 · 6 = 0.02808 m³ ; peso = 0.02808 · 7849 kg/m³ = 220.39992 kg
  const b = frame('B1');
  cerca(b.longitud_m, 6, 1e-9, 'longitud');
  cerca(b.area_m2, 0.00468, 1e-9, 'área');
  cerca(b.volumen_m3, 0.02808, 1e-6, 'volumen');
  cerca(b.peso_kg, 220.4, 0.01, 'peso');
  igual(b.tipo, 'viga');
  igual(b.clase, 'acero');
});

await prueba('columna de concreto 0.50×0.50, un piso de 4 m: volumen 1.00 m³, sin peso', () => {
  // V = 0.5 · 0.5 · 4 = 1.0 m³
  const c = frame('C1');
  cerca(c.longitud_m, 4, 1e-9);
  cerca(c.volumen_m3, 1.0, 1e-6);
  igual(c.peso_kg, null, 'el concreto no reporta peso');
  igual([c.i[2], c.j[2]], [0, 4], 'va de Base (0) a Story1 (4)');
});

await prueba('columna del piso 2 (3 m): 0.75 m³', () => {
  // V = 0.25 · 3 = 0.75 m³ ; de Story1 (4) a Story2 (7)
  const c = frame('C2');
  cerca(c.volumen_m3, 0.75, 1e-6);
  igual([c.i[2], c.j[2]], [4, 7]);
});

await prueba('losa 6×8 m, e = 0.15 m: área 48 m², volumen 7.2 m³', () => {
  // A = 6·8 = 48 ; V = 48 · 0.15 = 7.2
  const f = area('F1');
  cerca(f.area_m2, 48, 1e-9);
  cerca(f.volumen_m3, 7.2, 1e-6);
  igual(f.tipo, 'losa');
  igual(f.pts.every((p) => p[2] === 4), true, 'a la elevación de Story1');
});

await prueba('muro de 6 m de largo, 3 m de alto, e = 0.20 m: 18 m² y 3.6 m³', () => {
  // A = 6·3 = 18 ; V = 18 · 0.2 = 3.6 ; de Story1 (4) a Story2 (7)
  const w = area('W1');
  cerca(w.area_m2, 18, 1e-9);
  cerca(w.volumen_m3, 3.6, 1e-6);
  igual(w.tipo, 'muro');
  igual(Math.min(...w.pts.map((p) => p[2])), 4);
  igual(Math.max(...w.pts.map((p) => p[2])), 7);
});

await prueba('totales del modelo', () => {
  // acero = 220.4 kg ; concreto = 1.0 + 0.75 + 7.2 + 3.6 = 12.55 m³
  cerca(modelo.totales.peso_acero_kg, 220.4, 0.01);
  cerca(modelo.totales.volumen_concreto_m3, 12.55, 1e-3);
});

// --- Unidades: el mismo modelo en otras unidades debe dar lo mismo ---

await prueba('mismo modelo en cm y kgf/cm³ da las mismas cantidades', () => {
  // longitudes ×100; peso volumétrico 7849 kgf/m³ = 7849/1e6 = 0.007849 kgf/cm³ ; 2400 -> 0.0024
  const cm = texto
    .replace('"KGF"  "M"', '"KGF"  "CM"')
    .replace('HEIGHT 3', 'HEIGHT 300').replace('HEIGHT 4', 'HEIGHT 400')
    .replace('WEIGHTPERVOLUME 7849', 'WEIGHTPERVOLUME 0.007849')
    .replace('WEIGHTPERVOLUME 2400', 'WEIGHTPERVOLUME 0.0024')
    .replace('D 0.30  BF 0.15  TF 0.01  TW 0.006', 'D 30  BF 15  TF 1  TW 0.6')
    .replace('D 0.5  B 0.5', 'D 50  B 50')
    .replace('SLABTHICKNESS 0.15', 'SLABTHICKNESS 15').replace('WALLTHICKNESS 0.20', 'WALLTHICKNESS 20')
    .replace('"2"  6 0', '"2"  600 0').replace('"3"  6 8', '"3"  600 800').replace('"4"  0 8', '"4"  0 800');
  const m2 = construirModelo(parsearE2k(cm));
  cerca(m2.frames.find((f) => f.id === 'B1').peso_kg, 220.4, 0.01);
  cerca(m2.totales.volumen_concreto_m3, 12.55, 1e-3);
});

await prueba('mismo modelo en kN y m: peso de la viga ≈ 220.4 kg', () => {
  // γ = 7849 kgf/m³ · 9.80665 / 1000 = 76.97239 kN/m³ ; peso = 0.02808 · 76.97239 / 9.80665 · 1000 = 220.4 kg
  const kn = texto.replace('"KGF"', '"KN"').replace('WEIGHTPERVOLUME 7849', 'WEIGHTPERVOLUME 76.97239');
  cerca(construirModelo(parsearE2k(kn)).frames.find((f) => f.id === 'B1').peso_kg, 220.4, 0.05);
});

await prueba('factores de unidades exactos', () => {
  igual(factorLongitudAM('IN'), 0.0254); // 1 in = 25.4 mm exactos
  igual(factorLongitudAM('FT'), 0.3048); // 1 ft = 0.3048 m exactos
  igual(factorFuerzaAKgf('LB'), 0.45359237); // 1 lb = 0.45359237 kg exactos
  igual(factorFuerzaAKgf('KIP'), 453.59237);
  igual(factorFuerzaAKgf('TON'), 1000);
});

// --- Funciones geométricas puras ---

await prueba('áreas de perfiles', () => {
  // Tubo B=0.2 D=0.3 tf=tw=0.01: 0.2·0.3 − (0.2−0.02)(0.3−0.02) = 0.06 − 0.0504 = 0.0096
  cerca(areaDeSeccion('Steel Tube', { B: 0.2, D: 0.3, TF: 0.01, TW: 0.01 }), 0.0096, 1e-9);
  // Tubo circular D=0.2 t=0.01: π/4·(0.2² − 0.18²) = π/4·0.0076 = 0.0059690
  cerca(areaDeSeccion('Steel Pipe', { D: 0.2, TW: 0.01 }), 0.005969, 1e-7);
  // Círculo de concreto D=0.6: π/4·0.36 = 0.282743
  cerca(areaDeSeccion('Concrete Circle', { D: 0.6 }), 0.282743, 1e-6);
  igual(areaDeSeccion('Forma Rara', { D: 1 }), null);
});

await prueba('área de polígono 3D: rectángulo 3×2 vertical', () => {
  cerca(areaPoligono3d([[0, 0, 0], [3, 0, 0], [3, 0, 2], [0, 0, 2]]), 6, 1e-12);
});

await prueba('ejes locales (convención ETABS)', () => {
  const casi = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 1e-9);
  // Viga a lo largo de X: e2 = +Z (arriba), e3 = e1 × e2 = X × Z = −Y
  let e = ejesLocales([0, 0, 0], [6, 0, 0]);
  igual([casi(e.e1, [1, 0, 0]), casi(e.e2, [0, 0, 1]), casi(e.e3, [0, -1, 0])], [true, true, true]);
  // Viga a lo largo de Y: e3 = Y × Z = +X
  e = ejesLocales([0, 0, 0], [0, 6, 0]);
  igual([casi(e.e2, [0, 0, 1]), casi(e.e3, [1, 0, 0])], [true, true]);
  // Columna: e2 = +X, e3 = Z × X = +Y
  e = ejesLocales([0, 0, 0], [0, 0, 3]);
  igual([casi(e.e2, [1, 0, 0]), casi(e.e3, [0, 1, 0])], [true, true]);
  // Columna girada 90°: e2 = +Y, e3 = −X
  e = ejesLocales([0, 0, 0], [0, 0, 3], 90);
  igual([casi(e.e2, [0, 1, 0]), casi(e.e3, [-1, 0, 0])], [true, true]);
});

// --- Entradas inválidas ---

await prueba('entradas inválidas dan errores claros', async () => {
  await lanza(() => parsearE2k(''), /vacío/);
  await lanza(() => parsearE2k('$ CONTROLS\n$ STORIES\n  STORY "Base" ELEVATION 0\n'), /UNITS/);
  await lanza(() => construirModelo(parsearE2k(texto.replace('"KGF"  "M"', '"KGF"  "YARDA"'))), /longitud no reconocida/);
  await lanza(() => construirModelo(parsearE2k(texto.replace('"Base"  ELEVATION 0', '"Base"'))), /ELEV/);
});

// --- Formato real de ETABS 23.3.2 (extracto con la sintaxis del archivo exportado) ---
// Las secciones de catálogo no traen área en el .e2k; los 0.004 y 0.001 m² de la tabla son valores
// de prueba escritos a mano (no son propiedades AISC) para verificar la mecánica de cálculo.
import { parsearTablaSecciones } from '../src/core/tabla.js';

const textoReal = await leerFixture('formato-real.e2k');
const csv = await leerFixture('secciones.csv');
const GAMMA = 7849.0477; // 7.8490477 tonf/m³ × 1000 kg/tonf
const real = construirModelo(parsearE2k(textoReal), { tablaSecciones: parsearTablaSecciones(csv) });
const sinTabla = construirModelo(parsearE2k(textoReal));
const porUid = (m, uid) => m.frames.find((f) => f.uid === uid);

await prueba('pisos con ELEV en la base y MASTERSTORY', () => {
  // Cim 0; Nivel 1 = 3.26; Nivel 2 = 6.52
  igual(real.pisos.map((p) => p.elevacion_m), [0, 3.26, 6.52]);
});

await prueba('un frame por cada piso asignado (columna C1 en 2 pisos)', () => {
  // Hay 6 LINEASSIGN en el archivo
  igual(real.frames.length, 6);
  const c1 = porUid(real, 'C1|Nivel 1'), c2 = porUid(real, 'C1|Nivel 2');
  igual([c1.i[2], c1.j[2]], [0, 3.26]);
  igual([c2.i[2], c2.j[2]], [3.26, 6.52]);
});

await prueba('peso con área de la tabla: columna C1 en Nivel 1', () => {
  // L = 3.26 m ; A = 0.004 m² -> V = 0.01304 m³ ; peso = 0.01304 × 7849.0477 = 102.3516 kg
  const c = porUid(real, 'C1|Nivel 1');
  cerca(c.longitud_m, 3.26, 1e-9);
  cerca(c.volumen_m3, 0.01304, 1e-6);
  cerca(c.peso_kg, 102.35, 0.01);
});

await prueba('longitudes: viga, viga a centro y diagonal', () => {
  // El modelo redondea longitudes a 0.1 mm (4 decimales en m): tolerancia 6e-5 m.
  cerca(porUid(real, 'B1|Nivel 1').longitud_m, 2.5, 1e-9);
  // √(1.25² + 1.75²) = √4.625 = 2.150581
  cerca(porUid(real, 'P1|Nivel 1').longitud_m, 2.150581, 6e-5);
  // diagonal de 2.5 m en planta y 3.26 m de altura: √(6.25 + 10.6276) = √16.8776 = 4.108233
  cerca(porUid(real, 'D1|Nivel 1').longitud_m, 4.108233, 6e-5);
});

await prueba('contraviento: extremo I abajo (supuesto) y J arriba', () => {
  const d = porUid(real, 'D1|Nivel 1');
  igual(d.tipo, 'contraviento');
  igual([d.i, d.j], [[2.5, 0, 0], [0, 0, 3.26]]);
});

await prueba('sin tabla: no hay peso pero sí dibujo y aviso', () => {
  const c = porUid(sinTabla, 'C1|Nivel 1');
  igual(c.peso_kg, null);
  igual(c.volumen_m3, null);
  igual(sinTabla.secciones['HSS8X8X1/4'].perfil !== null, true, 'perfil HSS por nombre');
  igual(sinTabla.avisos.some((a) => /HSS8X8X1\/4.*sin área/.test(a)), true);
});

await prueba('tabla: unidades por fila de unidades, por parámetro y errores', async () => {
  // Fila de unidades "m²": la longitud ya está en m
  cerca(parsearTablaSecciones(csv)['HSS3X3X1/8'].area_m2, 0.001, 1e-12);
  // Misma tabla en cm (sin fila de unidades): 10 cm² = 0.001 m² ; 7.62 cm = 0.0762 m
  const cm = 'Name;Material;Shape;t3;t2;tf;tw;Area\nS1;M;Steel Tube;7.62;7.62;0.3;0.3;10\n';
  const t = parsearTablaSecciones(cm, 'CM').S1;
  cerca(t.area_m2, 0.001, 1e-12);
  cerca(t.D, 0.0762, 1e-12);
  await lanza(() => parsearTablaSecciones('a,b\n1,2\n'), /Name.*Area/);
  await lanza(() => parsearTablaSecciones(''), /vacía/);
});

await prueba('densidad del acero desde TONF/m³', () => {
  cerca(real.materiales.A500GrB46.pesoVolumetrico_kgm3, GAMMA, 0.01);
});
