import { prueba, cerca, igual, lanza, leerFixture } from './lib.js';
import { construirPaquete, construirModeloDeEntrada, sellarPaquete, generarIdPaquete, generarContrasena } from '../src/core/paquete.js';
import { descifrarPaquete } from '../src/core/cripto.js';

const e2k = await leerFixture('formato-real.e2k');
const tabla = await leerFixture('secciones.csv');

await prueba('paquete de punta a punta: archivos -> cifrado -> descifrado', async () => {
  const p = construirPaquete(' Cliente Demo ', [
    { nombre: 'Torre A', e2k, tabla },
    { nombre: 'Torre B', e2k },
  ]);
  igual(p.nombre, 'Cliente Demo');
  igual(p.modelos.map((m) => m.nombre), ['Torre A', 'Torre B']);
  const sobre = await sellarPaquete(p, 'frase-larga-de-prueba-123');
  const abierto = await descifrarPaquete(sobre, 'frase-larga-de-prueba-123');
  igual(abierto, p);
  // Torre A tiene tabla -> peso de C1|Nivel 1 = 0.004 m² × 3.26 m × 7849.0477 kg/m³ = 102.35 kg (cálculo manual)
  cerca(abierto.modelos[0].frames.find((f) => f.uid === 'C1|Nivel 1').peso_kg, 102.35, 0.01);
  igual(abierto.modelos[1].frames.find((f) => f.uid === 'C1|Nivel 1').peso_kg, null);
});

await prueba('errores del paquete nombran el modelo con problema', async () => {
  await lanza(() => construirPaquete('X', []), /al menos un modelo/);
  await lanza(() => construirPaquete('', [{ e2k }]), /nombre del paquete/);
  await lanza(() => construirPaquete('X', [{ nombre: 'Malo', e2k: 'basura' }]), /Malo:/);
});

await prueba('un modelo suelto lleva "Modelo n" por omisión y sus errores nombran el modelo', async () => {
  igual(construirModeloDeEntrada({ e2k }, 2).nombre, 'Modelo 3');
  await lanza(() => construirModeloDeEntrada({ nombre: 'Malo', e2k: 'basura' }, 0), /Malo:/);
});

await prueba('id y contraseña generados tienen el formato esperado', () => {
  igual(/^[0-9a-f]{16}$/.test(generarIdPaquete()), true);
  igual(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/.test(generarContrasena()), true);
  igual(generarContrasena() === generarContrasena(), false);
});
