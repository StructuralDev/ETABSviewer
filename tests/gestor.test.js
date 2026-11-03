// Gestor de paquetes: renombrar, reordenar, quitar, presentación (etiquetas, colores, notas).
// Los valores esperados están calculados a mano a partir de paquetes de 3 modelos A, B, C.
import { prueba, igual, lanza } from './lib.js';
import {
  moverModelo, quitarModelo, agregarModelo, renombrarModelo, renombrarPaquete, fijarNotaPaquete,
  fijarMeta, sanearMeta, validarPaquete, etiquetaDePiso, etiquetaDeEje, claveEje,
} from '../src/core/gestor.js';
import { sellarPaquete } from '../src/core/paquete.js';
import { descifrarPaquete } from '../src/core/cripto.js';

const pisos = [{ nombre: 'N1', elevacion_m: 3 }, { nombre: 'N2', elevacion_m: 6 }];
const ejeA = { sistema: 'G1', dir: 'X', coord_m: 0, etiqueta: 'A' };
const base = () => ({ nombre: 'Cliente', modelos: ['A', 'B', 'C'].map((n) => ({ nombre: n, pisos, frames: [], areas: [] })) });
const nombres = (p) => p.modelos.map((m) => m.nombre);

await prueba('reordenar [A, B, C]: C al inicio -> [C, A, B]; A al final -> [B, C, A]', () => {
  igual(nombres(moverModelo(base(), 2, 0)), ['C', 'A', 'B']);
  igual(nombres(moverModelo(base(), 0, 2)), ['B', 'C', 'A']);
  igual(nombres(moverModelo(base(), 1, 1)), ['A', 'B', 'C']);
});

await prueba('quitar el modelo 2 de 3 deja [A, C]; el original no cambia', () => {
  const p = base();
  igual(nombres(quitarModelo(p, 1)), ['A', 'C']);
  igual(nombres(p), ['A', 'B', 'C']);
});

await prueba('agregar pone el modelo al final; índices fuera de rango fallan', async () => {
  igual(nombres(agregarModelo(base(), { nombre: 'D' })), ['A', 'B', 'C', 'D']);
  await lanza(() => quitarModelo(base(), 3), /No existe el modelo 4/);
  await lanza(() => moverModelo(base(), 0, -1), /No existe/);
});

await prueba('renombrar recorta espacios y quita caracteres de control', () => {
  igual(renombrarModelo(base(), 0, '  Torre\u0000 Norte \n').modelos[0].nombre, 'Torre Norte');
  igual(renombrarPaquete(base(), '  Cliente 2 ').nombre, 'Cliente 2');
});

await prueba('validar: sin modelos o con nombre vacío falla', async () => {
  await lanza(() => validarPaquete(quitarModelo(quitarModelo(quitarModelo(base(), 0), 0), 0)), /al menos un modelo/);
  await lanza(() => validarPaquete(renombrarModelo(base(), 1, '   ')), /modelo 2 no tiene nombre/);
  await lanza(() => validarPaquete(renombrarPaquete(base(), ' ')), /nombre del paquete/);
  igual(validarPaquete(base()).nombre, 'Cliente');
});

await prueba('sanearMeta conserva lo válido y descarta el resto', () => {
  igual(sanearMeta({
    nota: '  Rev. 3\u0000 ',
    colorPor: 'seccion',
    colores: { seccion: { W2: '#AABBCC', W10: 'rojo' }, piso: {}, otro: { x: '#000000' } },
    alias: { pisos: { N1: 'Nivel 1', N2: '   ' }, ejes: { 'G1|X|A': 'ABCDEFGH' } },
    desconocido: 1,
  }), {
    nota: 'Rev. 3',
    colorPor: 'seccion',
    colores: { seccion: { W2: '#aabbcc' } },
    alias: { pisos: { N1: 'Nivel 1' }, ejes: { 'G1|X|A': 'ABCDEF' } }, // alias de eje: máximo 6 caracteres
  });
  igual(sanearMeta({ colorPor: 'clase', nota: '   ' }), undefined); // "clase" es el valor por omisión
  igual(sanearMeta({ colorPor: 'ninguno' }), undefined);
  igual(sanearMeta(null), undefined);
  igual(sanearMeta({ nota: 'x'.repeat(3000) }).nota.length, 2000);
});

await prueba('un alias de piso cambia el texto mostrado sin tocar las elevaciones', () => {
  const p = fijarMeta(base(), 0, { alias: { pisos: { N1: 'Nivel 1' }, ejes: { [claveEje(ejeA)]: 'A1' } } });
  const m = p.modelos[0];
  igual(etiquetaDePiso(m, 'N1'), 'Nivel 1');
  igual(etiquetaDePiso(m, 'N2'), 'N2'); // sin alias se queda el nombre de ETABS
  igual(etiquetaDeEje(m, ejeA), 'A1');
  igual(claveEje(ejeA), 'G1|X|A');
  igual(m.pisos, [{ nombre: 'N1', elevacion_m: 3 }, { nombre: 'N2', elevacion_m: 6 }]);
  igual(etiquetaDePiso(p.modelos[1], 'N1'), 'N1'); // los otros modelos no cambian
});

await prueba('un modelo anterior, sin meta, sigue funcionando', () => {
  const m = base().modelos[0];
  igual(etiquetaDePiso(m, 'N1'), 'N1');
  igual(etiquetaDeEje(m, ejeA), 'A');
});

await prueba('fijarMeta reemplaza y, si queda vacía, elimina la presentación; la nota del paquete igual', () => {
  const con = fijarMeta(base(), 2, { nota: 'Versión 2', colorPor: 'piso' });
  igual(con.modelos[2].meta, { nota: 'Versión 2', colorPor: 'piso' });
  igual('meta' in fijarMeta(con, 2, {}).modelos[2], false);
  const nota = fijarNotaPaquete(base(), ' Entrega parcial ');
  igual(nota.nota, 'Entrega parcial');
  igual('nota' in fijarNotaPaquete(nota, ''), false);
});

await prueba('la presentación sobrevive al cifrado y al descifrado', async () => {
  const p = fijarNotaPaquete(fijarMeta(base(), 0, { nota: 'Alcance: estructura metálica', colorPor: 'tipo', colores: { tipo: { viga: '#123456' } } }), 'Hola');
  const abierto = await descifrarPaquete(await sellarPaquete(p, 'frase-larga-de-prueba-123'), 'frase-larga-de-prueba-123');
  igual(abierto, p);
});
