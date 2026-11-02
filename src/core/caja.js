// Geometría 2D de la caja de selección estilo CAD, en coordenadas de pantalla. Sin acceso al DOM.
//   izquierda -> derecha ("ventana"): toma solo lo que queda COMPLETAMENTE dentro de la caja
//   derecha -> izquierda ("cruce"):   toma todo lo que la toque, aunque sea en parte

export function normalizaRect(x0, y0, x1, y1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

export const modoDeCaja = (xInicio, xFin) => (xFin >= xInicio ? 'ventana' : 'cruce');

export const puntoEnRect = (p, r) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1;

// ¿Todos los puntos caen dentro del rectángulo? (selección por ventana)
export const puntosDentro = (pts, r) => pts.length > 0 && pts.every((p) => puntoEnRect(p, r));

// Segmento a-b contra rectángulo (recorte de Liang–Barsky): true si lo cruza o está dentro.
export function segmentoTocaRect(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const pasos = [[-dx, a[0] - r.x0], [dx, r.x1 - a[0]], [-dy, a[1] - r.y0], [dy, r.y1 - a[1]]];
  for (const [p, q] of pasos) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

// Polígono (cerrado) contra rectángulo: algún vértice dentro, algún lado que lo cruce, o el
// rectángulo completo dentro del polígono.
export function poligonoTocaRect(pts, r) {
  if (pts.some((p) => puntoEnRect(p, r))) return true;
  for (let k = 0; k < pts.length; k++) {
    if (segmentoTocaRect(pts[k], pts[(k + 1) % pts.length], r)) return true;
  }
  return puntoEnPoligono([r.x0, r.y0], pts);
}

export function puntoEnPoligono(p, pts) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
