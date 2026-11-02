// Casos de verificación de vistas. Los conteos se obtuvieron leyendo a mano
// tests/fixtures/formato-real.e2k (líneas y asignaciones por piso), no del código probado.
import { prueba, igual, leerFixture } from './lib.js';
import { parsearE2k } from '../src/core/e2k.js';
import { construirModelo } from '../src/core/modelo.js';
import { pisosConElementos, elementosDePiso, elementosDeEje, enPlanoDeEje, azimutAlzado } from '../src/core/vistas.js';

const modelo = construirModelo(parsearE2k(await leerFixture('formato-real.e2k')));
const eje = (etiqueta) => modelo.ejes.find((e) => e.etiqueta === etiqueta);

await prueba('ejes leídos del $ GRIDS', () => {
  igual(modelo.ejes.map((e) => [e.etiqueta, e.dir, e.coord_m]), [['A', 'X', 0], ['B', 'X', 2.5], ['1', 'Y', 0], ['2', 'Y', 3.5]]);
});

await prueba('pisos con elementos excluyen la base', () => {
  igual(pisosConElementos(modelo), ['Nivel 1', 'Nivel 2']);
});

await prueba('planta: elementos asignados a cada piso', () => {
  // Nivel 1: C1, B1, P1, D1 (4). Nivel 2: C1, B1 (2).
  igual(elementosDePiso(modelo, 'Nivel 1').map((e) => e.id).sort(), ['B1', 'C1', 'D1', 'P1']);
  igual(elementosDePiso(modelo, 'Nivel 2').map((e) => e.id).sort(), ['B1', 'C1']);
});

await prueba('alzado del eje A (x = 0): solo la columna C1 de ambos pisos', () => {
  // Puntos: 1 (0,0), 2 (2.5,0), 5 (1.25,1.75). Solo C1 está sobre x = 0 (B1, P1 y D1 salen de ahí).
  igual(elementosDeEje(modelo, eje('A')).map((e) => e.uid).sort(), ['C1|Nivel 1', 'C1|Nivel 2']);
});

await prueba('alzado del eje 1 (y = 0): C1 x2, B1 x2 y la diagonal D1', () => {
  igual(elementosDeEje(modelo, eje('1')).map((e) => e.uid).sort(),
    ['B1|Nivel 1', 'B1|Nivel 2', 'C1|Nivel 1', 'C1|Nivel 2', 'D1|Nivel 1']);
});

await prueba('tolerancia del eje y dirección de la cámara', () => {
  const e = { i: [0.005, 0, 0], j: [0.005, 0, 3] };
  igual(enPlanoDeEje(e, eje('A')), true); // 5 mm < 1 cm
  igual(enPlanoDeEje({ i: [0.05, 0, 0], j: [0.05, 0, 3] }, eje('A')), false); // 5 cm
  igual([azimutAlzado(eje('1')), azimutAlzado(eje('A'))], [0, Math.PI / 2]);
});
