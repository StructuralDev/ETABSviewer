// Conversiones de unidades del visor ETABS. Es el ÚNICO lugar donde se convierten unidades.
// Salida del visor: longitud en m, área en m², volumen en m³, peso en kg.

// Gravedad estándar, 9.80665 m/s² (CGPM 1901, ISO 80000-3). Convierte N <-> kgf.
export const GRAVEDAD_M_S2 = 9.80665;

// Longitud -> metros. Nombres tal como los escribe ETABS en `UNITS` del .e2k.
const LONGITUD_A_M = {
  MM: 0.001,
  CM: 0.01,
  M: 1,
  IN: 0.0254, // pulgada internacional, exacta
  FT: 0.3048, // pie internacional, exacto
};

// Fuerza -> kilogramos-fuerza (el "peso en kg" que muestra el visor).
const FUERZA_A_KGF = {
  KGF: 1,
  TON: 1000, // ETABS usa "Ton" para tonelada-fuerza métrica
  TONF: 1000,
  N: 1 / GRAVEDAD_M_S2,
  KN: 1000 / GRAVEDAD_M_S2,
  LB: 0.45359237, // libra avoirdupois, exacta (1959)
  KIP: 453.59237,
};

export class ErrorUnidades extends Error {}

export function factorLongitudAM(unidad) {
  const f = LONGITUD_A_M[String(unidad ?? '').toUpperCase()];
  if (f === undefined) throw new ErrorUnidades(`Unidad de longitud no reconocida: "${unidad}"`);
  return f;
}

export function factorFuerzaAKgf(unidad) {
  const f = FUERZA_A_KGF[String(unidad ?? '').toUpperCase()];
  if (f === undefined) throw new ErrorUnidades(`Unidad de fuerza no reconocida: "${unidad}"`);
  return f;
}

// Peso volumétrico (fuerza/longitud³) -> kg/m³.
export function pesoVolumetricoAKgM3(valor, unidadFuerza, unidadLongitud) {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new ErrorUnidades(`Peso volumétrico inválido: ${valor}`);
  }
  const l = factorLongitudAM(unidadLongitud);
  return (valor * factorFuerzaAKgf(unidadFuerza)) / (l * l * l);
}

// Solo para mostrar el área de sección en cm² (costumbre de catálogos de perfiles).
export const M2_A_CM2 = 1e4;
