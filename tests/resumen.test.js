import { prueba, cerca, igual } from './lib.js';
import { resumir, agruparPor, volumenTotal_m3 } from '../src/core/resumen.js';

await prueba('resumen de una selección mixta', () => {
  // Caso manual: viga de acero 6 m (220.4 kg, 0.02808 m³), columna de concreto 4 m (1.0 m³),
  // losa (48 m², 7.2 m³) y una columna sin área (sin cantidad).
  const sel = [
    { tipo: 'viga', clase: 'acero', longitud_m: 6, volumen_m3: 0.02808, peso_kg: 220.4 },
    { tipo: 'columna', clase: 'concreto', longitud_m: 4, volumen_m3: 1.0, peso_kg: null },
    { tipo: 'losa', clase: 'concreto', pts: [[0, 0, 0]], area_m2: 48, volumen_m3: 7.2, peso_kg: null },
    { tipo: 'columna', clase: 'acero', longitud_m: 3, volumen_m3: null, peso_kg: null },
  ];
  const r = resumir(sel);
  igual(r.n, 4);
  igual(r.porTipo, { viga: 1, columna: 2, losa: 1 });
  cerca(r.longitud_m, 13, 1e-12); // 6 + 4 + 3
  cerca(r.area_m2, 48, 1e-12);
  cerca(r.peso_acero_kg, 220.4, 1e-9);
  cerca(r.volumen_concreto_m3, 8.2, 1e-12); // 1.0 + 7.2
  igual(r.sinCantidad, 1);
});

await prueba('resumen de selección vacía', () => {
  const r = resumir([]);
  igual([r.n, r.peso_acero_kg, r.volumen_concreto_m3, r.sinCantidad], [0, 0, 0, 0]);
});

// ---------- Subtotales por categoría ----------
// 5 elementos con cantidades calculadas a mano (volumen = área de sección × longitud; peso = volumen × 7850 kg/m³ aprox.).
const el =(o) => ({ peso_kg: null, ...o });
const varios = [
  el({ tipo: 'viga', clase: 'acero', seccion: 'W10', piso: 'N1', longitud_m: 6, volumen_m3: 0.02808, peso_kg: 220.4 }),
  el({ tipo: 'viga', clase: 'acero', seccion: 'W10', piso: 'N2', longitud_m: 4, volumen_m3: 0.01872, peso_kg: 146.9 }),
  el({ tipo: 'columna', clase: 'acero', seccion: 'W2', piso: 'N1', longitud_m: 3, volumen_m3: 0.01, peso_kg: 78.5 }),
  el({ tipo: 'losa', clase: 'concreto', seccion: 'LOSA15', piso: 'N2', pts: [[0, 0, 0]], area_m2: 48, volumen_m3: 7.2 }),
  el({ tipo: 'columna', clase: 'concreto', seccion: 'C30x30', piso: 'N1', longitud_m: 4, volumen_m3: 0.36 }),
];
const compacto = (g) => g.map((x) => [x.valor, x.resumen.n, +x.resumen.peso_acero_kg.toFixed(3), +volumenTotal_m3(x.resumen).toFixed(5)]);

await prueba('subtotales por sección: orden natural y valores sumados a mano', () => {
  // W10 = 220.4 + 146.9 = 367.3 kg y 0.02808 + 0.01872 = 0.0468 m³
  igual(compacto(agruparPor(varios, 'seccion')), [
    ['C30x30', 1, 0, 0.36],
    ['LOSA15', 1, 0, 7.2],
    ['W2', 1, 78.5, 0.01],
    ['W10', 2, 367.3, 0.0468],
  ]);
});

await prueba('subtotales por piso (en el orden dado), tipo y acero/concreto', () => {
  igual(compacto(agruparPor(varios, 'piso', { pisos: ['N1', 'N2'] })), [['N1', 3, 298.9, 0.39808], ['N2', 2, 146.9, 7.21872]]);
  igual(compacto(agruparPor(varios, 'piso', { pisos: ['N2', 'N1'] })).map((x) => x[0]), ['N2', 'N1']);
  igual(compacto(agruparPor(varios, 'tipo')), [['columna', 2, 78.5, 0.37], ['losa', 1, 0, 7.2], ['viga', 2, 367.3, 0.0468]]);
  igual(compacto(agruparPor(varios, 'clase')), [['acero', 3, 445.8, 0.0568], ['concreto', 2, 0, 7.56]]);
});

await prueba('los subtotales suman exactamente el total (para cualquier criterio)', () => {
  const total = resumir(varios);
  cerca(volumenTotal_m3(total), 7.6168, 1e-12); // 0.0468 + 0.01 + 7.2 + 0.36
  cerca(total.peso_acero_kg, 445.8, 1e-9);
  for (const criterio of ['clase', 'tipo', 'seccion', 'material', 'piso']) {
    const g = agruparPor(varios, criterio, { pisos: ['N1', 'N2'] });
    cerca(g.reduce((s, x) => s + x.resumen.n, 0), 5, 0, criterio);
    cerca(g.reduce((s, x) => s + x.resumen.peso_acero_kg, 0), total.peso_acero_kg, 1e-9, criterio);
    cerca(g.reduce((s, x) => s + volumenTotal_m3(x.resumen), 0), volumenTotal_m3(total), 1e-12, criterio);
    cerca(g.reduce((s, x) => s + x.resumen.longitud_m, 0), 17, 1e-12, criterio); // 6 + 4 + 3 + 4
    cerca(g.reduce((s, x) => s + x.resumen.area_m2, 0), 48, 1e-12, criterio);
  }
});

await prueba('un elemento sin cantidades cuenta en su grupo y se avisa; sin dato se agrupa como "—"', () => {
  const g = agruparPor([el({ tipo: 'viga', clase: 'acero', longitud_m: 2, volumen_m3: null })], 'seccion');
  igual(g.map((x) => [x.valor, x.resumen.n, x.resumen.sinCantidad]), [['—', 1, 1]]);
  igual(agruparPor([], 'tipo'), []);
});
