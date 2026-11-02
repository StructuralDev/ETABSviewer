import { prueba, cerca, igual } from './lib.js';
import { resumir } from '../src/core/resumen.js';

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
