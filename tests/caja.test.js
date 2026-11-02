// Casos de la caja de selección estilo CAD. Rectángulo de prueba: (10,10)-(50,40). Los resultados
// se razonaron a mano sobre el dibujo (cada comentario dice qué pasa geométricamente).
import { prueba, igual } from './lib.js';
import { normalizaRect, modoDeCaja, puntosDentro, segmentoTocaRect, poligonoTocaRect } from '../src/core/caja.js';

const R = normalizaRect(10, 10, 50, 40);

await prueba('dirección de la caja: derecha = ventana, izquierda = cruce', () => {
  igual(modoDeCaja(100, 200), 'ventana');
  igual(modoDeCaja(200, 100), 'cruce');
  igual(normalizaRect(50, 40, 10, 10), R); // el orden de las esquinas no importa
});

await prueba('ventana: solo si todos los puntos están dentro', () => {
  igual(puntosDentro([[20, 20], [40, 30]], R), true);
  igual(puntosDentro([[20, 20], [60, 30]], R), false); // un extremo sale por la derecha
  igual(puntosDentro([], R), false);
});

await prueba('cruce: segmentos dentro, cruzando y fuera', () => {
  igual(segmentoTocaRect([20, 20], [30, 30], R), true); // completamente dentro
  igual(segmentoTocaRect([0, 25], [60, 25], R), true); // atraviesa de lado a lado, extremos fuera
  igual(segmentoTocaRect([0, 0], [60, 50], R), true); // diagonal que pasa por el rectángulo
  igual(segmentoTocaRect([0, 0], [8, 50], R), false); // pasa a la izquierda sin tocar
  igual(segmentoTocaRect([0, 50], [60, 60], R), false); // pasa por debajo
  igual(segmentoTocaRect([60, 0], [60, 50], R), false); // vertical a la derecha
  igual(segmentoTocaRect([50, 0], [50, 50], R), true); // roza el borde derecho
});

await prueba('polígono: vértice dentro, lado cruzando, caja dentro del polígono, ajeno', () => {
  igual(poligonoTocaRect([[0, 0], [20, 0], [20, 20], [0, 20]], R), true); // el vértice (20,20) está dentro
  igual(poligonoTocaRect([[-10, 20], [70, 20], [70, 30], [-10, 30]], R), true); // franja que lo cruza, sin vértices dentro
  igual(poligonoTocaRect([[0, 0], [100, 0], [100, 100], [0, 100]], R), true); // la caja queda dentro del polígono
  igual(poligonoTocaRect([[60, 60], [80, 60], [80, 80], [60, 80]], R), false); // lejos
});
