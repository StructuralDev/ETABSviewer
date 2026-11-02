// Convierte elementos del modelo (ejes de ETABS, Z hacia arriba, metros) en geometría three.js
// (Y hacia arriba). Cada elemento es un sólido: perfil de la sección extruido a lo largo del eje
// del frame, o polígono de losa/muro con su espesor.
import * as THREE from 'three';
import { ejesLocales } from '../core/modelo.js';

// ETABS (x, y, z) -> three (x, z, -y): rotación propia, conserva la orientación de los ejes.
const aThree = (v) => new THREE.Vector3(v[0], v[2], -v[1]);

const PERFIL_RESPALDO = { contorno: [[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]], huecos: [] };

function formaDe(perfil) {
  const forma = new THREE.Shape(perfil.contorno.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of perfil.huecos ?? []) forma.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  return forma;
}

export function geometriaFrame(frame, seccion) {
  const perfil = seccion?.perfil ?? PERFIL_RESPALDO;
  const { e1, e2, e3 } = ejesLocales(frame.i, frame.j, frame.ang_grados);
  const geo = new THREE.ExtrudeGeometry(formaDe(perfil), { depth: frame.longitud_m, bevelEnabled: false });
  // x local -> e3 (ancho), y local -> e2 (peralte), z local -> -e1 con origen en J: det = +1.
  const m = new THREE.Matrix4().makeBasis(aThree(e3), aThree(e2), aThree(e1).negate());
  m.setPosition(aThree(frame.j));
  geo.applyMatrix4(m);
  return geo;
}

export function geometriaArea(area) {
  const P = area.pts;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };
  // Normal por el método de Newell.
  let n = [0, 0, 0];
  for (let k = 0; k < P.length; k++) {
    const c = cruz(P[k], P[(k + 1) % P.length]);
    n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]];
  }
  n = unit(n);
  const u = unit(sub(P[1], P[0]));
  const v = cruz(n, u);
  const plano = P.map((p) => {
    const d = sub(p, P[0]);
    return [d[0] * u[0] + d[1] * u[1] + d[2] * u[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]];
  });
  const espesor = area.espesor_m ?? 0.02;
  const geo = new THREE.ExtrudeGeometry(formaDe({ contorno: plano }), { depth: espesor, bevelEnabled: false });
  const m = new THREE.Matrix4().makeBasis(aThree(u), aThree(v), aThree(n));
  // Centra el espesor sobre el plano del polígono.
  const origen = [P[0][0] - (n[0] * espesor) / 2, P[0][1] - (n[1] * espesor) / 2, P[0][2] - (n[2] * espesor) / 2];
  m.setPosition(aThree(origen));
  geo.applyMatrix4(m);
  return geo;
}
