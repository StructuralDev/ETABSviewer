// Vistas de planta (por piso) y alzado (por eje) como las define ETABS. Sin acceso al DOM.

export const TOLERANCIA_EJE_M = 0.01; // un objeto está "en el eje" si dista menos de 1 cm del plano

const todos = (modelo) => [...modelo.frames, ...modelo.areas];

// Pisos que tienen elementos asignados, de abajo hacia arriba (excluye la base sin elementos).
export function pisosConElementos(modelo) {
  const usados = new Set(todos(modelo).map((e) => e.piso));
  return modelo.pisos.map((p) => p.nombre).filter((n) => usados.has(n));
}

// Planta de un piso: los objetos asignados a ese piso (vigas y losas del nivel, columnas,
// contravientos y muros del entrepiso que llega a él), igual que la vista en planta de ETABS.
export function elementosDePiso(modelo, piso) {
  return todos(modelo).filter((e) => e.piso === piso);
}

const puntosDe = (e) => (e.i ? [e.i, e.j] : e.pts);

// ¿El elemento está contenido en el plano vertical del eje? (eje X: x = coord; eje Y: y = coord)
export function enPlanoDeEje(e, eje, tol_m = TOLERANCIA_EJE_M) {
  const k = eje.dir === 'X' ? 0 : 1;
  return puntosDe(e).every((p) => Math.abs(p[k] - eje.coord_m) <= tol_m);
}

export function elementosDeEje(modelo, eje) {
  return todos(modelo).filter((e) => enPlanoDeEje(e, eje));
}

// Azimut de la cámara orbital (convención de orbita.js, escena con Y arriba y z = -y de ETABS):
//  - eje Y (números): se mira desde -Y hacia +Y; a la derecha queda +X  -> azimut 0
//  - eje X (letras):  se mira desde +X hacia -X; a la derecha queda +Y  -> azimut +90°
export function azimutAlzado(eje) {
  return eje.dir === 'Y' ? 0 : Math.PI / 2;
}

export function etiquetaEje(eje, variosSistemas) {
  return `Eje ${eje.etiqueta}${variosSistemas ? ` (${eje.sistema})` : ''}`;
}
