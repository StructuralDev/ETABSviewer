// Totales de un conjunto de elementos (selección o modelo completo). Sin acceso al DOM.
// Acero -> peso (kg); concreto y demás -> volumen (m³).

export function resumir(elementos) {
  const r = {
    n: elementos.length,
    porTipo: {},
    longitud_m: 0, // suma de longitudes de frames
    area_m2: 0, // suma de áreas de losas y muros
    peso_acero_kg: 0,
    volumen_acero_m3: 0,
    volumen_concreto_m3: 0,
    volumen_otro_m3: 0,
    sinCantidad: 0, // elementos sin área de sección o sin espesor (no suman peso/volumen)
  };
  for (const e of elementos) {
    r.porTipo[e.tipo] = (r.porTipo[e.tipo] ?? 0) + 1;
    if (typeof e.longitud_m === 'number') r.longitud_m += e.longitud_m;
    if (e.pts && typeof e.area_m2 === 'number') r.area_m2 += e.area_m2;
    if (e.volumen_m3 === null || e.volumen_m3 === undefined) {
      r.sinCantidad++;
      continue;
    }
    if (e.clase === 'acero') {
      r.volumen_acero_m3 += e.volumen_m3;
      r.peso_acero_kg += e.peso_kg ?? 0;
    } else if (e.clase === 'concreto') r.volumen_concreto_m3 += e.volumen_m3;
    else r.volumen_otro_m3 += e.volumen_m3;
  }
  return r;
}
