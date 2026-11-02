// Peso del acero a partir del .e2k + la biblioteca de perfiles de ETABS (sin tabla de Excel).
// El extracto de la biblioteca copia valores reales de AISC14.xml (ETABS 23): HSS8X8X1/4 A = 7.1 in²,
// HSS3X3X1/8 A = 1.3 in². Esperados calculados a mano: 1 in² = 0.0254² m² = 6.4516e-4 m².
import { prueba, cerca, igual, lanza, leerFixture } from './lib.js';
import { parsearBibliotecaCsi } from '../src/core/biblioteca.js';
import { parsearE2k } from '../src/core/e2k.js';
import { construirModelo } from '../src/core/modelo.js';

const bib = parsearBibliotecaCsi(await leerFixture('biblioteca-mini.xml'));
const e2k = parsearE2k(await leerFixture('formato-real.e2k'));

await prueba('biblioteca: área y dimensiones convertidas a m', () => {
  const p = bib.perfiles['HSS8X8X1/4'];
  cerca(p.area_m2, 0.004580636, 1e-9); // 7.1 × 6.4516e-4
  cerca(p.D, 0.2032, 1e-9); // 8 in × 0.0254
  cerca(p.TF, 0.0059182, 1e-9); // 0.233 in × 0.0254
  igual(p.forma, 'Steel Tube');
  cerca(bib.perfiles['HSS3X3X1/8'].area_m2, 0.000838708, 1e-9); // 1.3 × 6.4516e-4
  igual(bib.perfiles['W44X335'].forma, 'Steel I/Wide Flange');
});

await prueba('el .e2k hereda FILE a las secciones siguientes', () => {
  igual(e2k.secciones['HSS8X8X1/4'].FILE, 'AISC14');
  igual(e2k.secciones['HSS3X3X1/8'].FILE, 'AISC14'); // el archivo no repite FILE en esta línea
});

await prueba('peso desde la biblioteca, sin tabla: columna y viga', () => {
  const m = construirModelo(e2k, { bibliotecas: { AISC14: bib } });
  const c = m.frames.find((f) => f.uid === 'C1|Nivel 1');
  // 0.004580636 m² × 3.26 m × 7849.0477 kg/m³ = 117.2088 kg
  cerca(c.peso_kg, 117.2088, 0.01);
  // 0.000838708 m² × 2.5 m × 7849.0477 kg/m³ = 16.4576 kg
  cerca(m.frames.find((f) => f.uid === 'B1|Nivel 1').peso_kg, 16.4576, 0.01);
  igual(m.secciones['HSS8X8X1/4'].origenArea, 'biblioteca');
  igual(m.secciones['HSS8X8X1/4'].perfil !== null, true, 'perfil con dimensiones reales');
});

await prueba('sin biblioteca: aviso que nombra el archivo a cargar', () => {
  const m = construirModelo(e2k);
  igual(m.avisos.some((a) => /AISC14/.test(a) && /biblioteca/.test(a)), true);
});

await prueba('claves de biblioteca sin distinguir mayúsculas y errores claros', async () => {
  const m = construirModelo(e2k, { bibliotecas: { aisc14: bib } });
  cerca(m.totales.peso_acero_kg > 0 ? 1 : 0, 1, 0);
  await lanza(() => parsearBibliotecaCsi('<html></html>'), /PROPERTY_FILE/);
  await lanza(() => parsearBibliotecaCsi('<PROPERTY_FILE><CONTROL></CONTROL></PROPERTY_FILE>'), /LENGTH_UNITS/);
});
