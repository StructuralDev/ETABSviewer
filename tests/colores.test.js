// Colores por categoría. Los valores esperados salen de ordenar a mano las categorías de un modelo
// de 4 elementos y asignarles la paleta en ese orden (PALETA[0] = azul, [1] = verde, [2] = rojo suave).
import { prueba, igual, lanza } from './lib.js';
import { leyenda, valorDeColor, PALETA } from '../src/core/colores.js';

const modelo = {
  pisos: [{ nombre: 'Sótano', elevacion_m: -3 }, { nombre: 'Azotea', elevacion_m: 9 }],
  frames: [
    { clase: 'acero', tipo: 'viga', seccion: 'W10', material: 'A992', piso: 'Azotea' },
    { clase: 'acero', tipo: 'columna', seccion: 'W2', material: 'A992', piso: 'Sótano' },
    { clase: 'acero', tipo: 'viga', seccion: 'W2', material: 'A992', piso: 'Sótano' },
  ],
  areas: [{ clase: 'concreto', tipo: 'losa', seccion: 'LOSA15', material: 'C30', piso: 'Azotea' }],
};
const resumen = (l) => l.map((x) => [x.valor, x.color, x.n]);

await prueba('color por sección: orden natural (W2 antes que W10) y paleta en ese orden', () => {
  igual(resumen(leyenda(modelo, 'seccion')), [
    ['LOSA15', PALETA[0], 1],
    ['W2', PALETA[1], 2],
    ['W10', PALETA[2], 1],
  ]);
  igual([PALETA[0], PALETA[1], PALETA[2]], ['#2C8FD0', '#78BE4B', '#E5736F']);
});

await prueba('color por piso: en orden de elevación, no alfabético', () => {
  igual(resumen(leyenda(modelo, 'piso')), [['Sótano', PALETA[0], 2], ['Azotea', PALETA[1], 2]]);
});

await prueba('color por tipo y por material', () => {
  igual(resumen(leyenda(modelo, 'tipo')), [['columna', PALETA[0], 1], ['losa', PALETA[1], 1], ['viga', PALETA[2], 2]]);
  igual(resumen(leyenda(modelo, 'material')), [['A992', PALETA[0], 3], ['C30', PALETA[1], 1]]);
});

await prueba('"acero / concreto" usa los colores base que entrega el visor', () => {
  const base = { acero: '#111111', concreto: '#222222' };
  igual(resumen(leyenda(modelo, 'clase', {}, base)), [['acero', '#111111', 3], ['concreto', '#222222', 1]]);
});

await prueba('el color propio manda, no mueve los demás y se ignora si no es #rrggbb', () => {
  const l = leyenda(modelo, 'seccion', { W2: '#ff00aa', W10: 'rojo', LOSA15: '#abc' });
  igual(resumen(l), [['LOSA15', PALETA[0], 1], ['W2', '#ff00aa', 2], ['W10', PALETA[2], 1]]);
  igual(l.map((x) => x.propio), [false, true, false]);
});

await prueba('la asignación es estable: no depende del orden de los elementos', () => {
  const invertido = { ...modelo, frames: [...modelo.frames].reverse() };
  igual(leyenda(invertido, 'seccion'), leyenda(modelo, 'seccion'));
});

await prueba('con más categorías que colores la paleta se repite', () => {
  const m = { pisos: [], areas: [], frames: Array.from({ length: 9 }, (_, k) => ({ clase: 'acero', seccion: `S${k + 1}` })) };
  const l = leyenda(m, 'seccion');
  igual(l.length, 9);
  igual(l[8].color, PALETA[0]); // S9 es la novena: 9 mod 8 = índice 0
});

await prueba('una sección llamada "constructor" recibe un color de la paleta', () => {
  const m = { pisos: [], areas: [], frames: [{ clase: 'acero', seccion: 'constructor' }, { clase: 'acero', seccion: 'toString' }] };
  igual(leyenda(m, 'seccion').map((x) => x.color), [PALETA[0], PALETA[1]]); // orden: constructor, toString
});

await prueba('sin dato se agrupa como "—" y un criterio desconocido falla', async () => {
  igual(valorDeColor({ clase: 'acero' }, 'seccion'), '—');
  await lanza(() => valorDeColor({}, 'color'), /desconocido/);
});
