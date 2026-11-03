// Convertidor y gestor de paquetes: arma el paquete de un cliente (o abre uno existente), permite
// renombrar, reordenar, quitar y agregar modelos, editar etiquetas, colores y notas, y descarga el
// paquete cifrado. La lista de modelos en pantalla es el paquete mismo (ver core/gestor.js).
import { construirModeloDeEntrada, sellarPaquete, generarIdPaquete, generarContrasena, bibliotecasUsadas } from '../core/paquete.js';
import { descifrarPaquete } from '../core/cripto.js';
import { resumir } from '../core/resumen.js';
import { leerXlsx } from '../core/xlsx.js';
import { parsearBibliotecaCsi } from '../core/biblioteca.js';
import { pisosConElementos } from '../core/vistas.js';
import { CRITERIOS, leyenda } from '../core/colores.js';
import {
  moverModelo, quitarModelo, agregarModelo, renombrarModelo, renombrarPaquete, fijarNotaPaquete, fijarMeta,
  validarPaquete, claveEje, propio, LIMITES, sanearMeta,
} from '../core/gestor.js';
import { guardarBiblioteca, borrarBiblioteca, leerBibliotecas, obtenerBibliotecas } from './bibliotecas.js';

const $ = (id) => document.getElementById(id);
const ID_ARCHIVO = /^([A-Za-z0-9_-]{4,64})\.enc\.json$/i;
const fmtNum = (n, d) => n.toLocaleString('es-MX', { maximumFractionDigits: d });

function nodo(tag, props = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'value') n.value = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return n;
}

// Los archivos de ETABS pesan de KB a decenas de MB; más de esto casi seguro no es lo esperado.
const MAX_BYTES_ENTRADA = 100 * 1024 * 1024;
function revisaTamano(archivo) {
  if (archivo && archivo.size > MAX_BYTES_ENTRADA) {
    throw new Error(`"${archivo.name}" pesa ${(archivo.size / 1048576).toFixed(0)} MB; el máximo es ${MAX_BYTES_ENTRADA / 1048576} MB.`);
  }
}
const leer = (input) => {
  const archivo = input?.files?.[0];
  revisaTamano(archivo);
  return archivo?.text() ?? Promise.resolve(undefined);
};

// La tabla de secciones puede ser Excel (.xlsx) o texto (.csv/.tsv/.txt).
async function leerTabla(input) {
  const archivo = input?.files?.[0];
  if (!archivo) return {};
  revisaTamano(archivo);
  if (/\.xlsx$/i.test(archivo.name)) return { hojasTabla: await leerXlsx(await archivo.arrayBuffer()) };
  return { tabla: await archivo.text() };
}

function descargar(nombre, objeto) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(objeto)], { type: 'application/json' }));
  const a = nodo('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function mostrarError(texto) {
  $('error').textContent = texto;
  $('error').hidden = false;
}

// ---------- Estado: el paquete que se está armando o editando ----------

let paquete = { nombre: '', modelos: [] };
const abiertos = new Set(); // secciones desplegadas de las tarjetas (se conservan al repintar)

// Aplica un cambio a la presentación (meta) del modelo k; el gestor la sanea.
const cambiaMeta = (k, f) => { paquete = fijarMeta(paquete, k, f(paquete.modelos[k].meta ?? {})); };
const setColor = (k, criterio, valor, hex) => cambiaMeta(k, (meta) => {
  const mapa = { ...meta.colores?.[criterio] };
  if (hex) mapa[valor] = hex; else delete mapa[valor];
  return { ...meta, colores: { ...meta.colores, [criterio]: mapa } };
});
const setAlias = (k, tipo, clave, valor) => cambiaMeta(k, (meta) => ({
  ...meta, alias: { ...meta.alias, [tipo]: { ...meta.alias?.[tipo], [clave]: valor } },
}));

// Colores de partida de "Acero / concreto": los mismos tokens que usa el visor.
const hexDeToken = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim().toLowerCase();
const baseClase = () => ({
  acero: hexDeToken('--alba-primary-300'),
  concreto: hexDeToken('--alba-neutral-300'),
  otro: hexDeToken('--alba-neutral-500'),
});

function detalle(clave, titulo, ...hijos) {
  const d = nodo('details', {}, nodo('summary', {}, titulo), ...hijos);
  d.open = abiertos.has(clave);
  d.addEventListener('toggle', () => { if (d.open) abiertos.add(clave); else abiertos.delete(clave); });
  return d;
}

function filaAlias(rotulo, original, actual, max, alCambiar) {
  const id = `alias-${filaAlias.contador = (filaAlias.contador ?? 0) + 1}`;
  const entrada = nodo('input', { id, type: 'text', maxlength: String(max), placeholder: original, value: actual });
  entrada.addEventListener('input', () => alCambiar(entrada.value));
  return nodo('div', { class: 'fila-alias' }, nodo('label', { for: id }, rotulo), entrada);
}

function tarjeta(m, k) {
  const meta = m.meta ?? {};
  const criterio = meta.colorPor ?? 'clase';
  const r = resumir([...m.frames, ...m.areas]);

  const nombre = nodo('input', { type: 'text', maxlength: String(LIMITES.nombre), value: m.nombre, 'aria-label': `Nombre del modelo ${k + 1}` });
  nombre.addEventListener('input', () => { paquete = renombrarModelo(paquete, k, nombre.value); });

  const mover = (a) => () => { paquete = moverModelo(paquete, k, a); abiertos.clear(); pintarLista(); };
  const subir = nodo('button', { type: 'button', class: 'btn sec chico', 'aria-label': 'Subir', onclick: mover(k - 1) }, '↑');
  const bajar = nodo('button', { type: 'button', class: 'btn sec chico', 'aria-label': 'Bajar', onclick: mover(k + 1) }, '↓');
  subir.disabled = k === 0;
  bajar.disabled = k === paquete.modelos.length - 1;
  // Quitar pide una segunda pulsación para confirmar (sin cuadros de diálogo).
  const quitar = nodo('button', { type: 'button', class: 'btn sec chico peligro' }, 'Quitar');
  const cabecera = nodo('div', { class: 'cabecera-modelo' }, nodo('span', { class: 'pos' }, `${k + 1}.`), nombre, subir, bajar, quitar);
  const advertencia = nodo('p', { class: 'aviso' }, 'Quitarlo no lo retira de quien ya tiene la contraseña: la versión anterior sigue en el historial de git. Para retirarlo de verdad, genera identificador y contraseña nuevos.');
  let temporizador = null;
  quitar.addEventListener('click', () => {
    if (temporizador === null) {
      quitar.textContent = '¿Seguro?';
      cabecera.after(advertencia);
      temporizador = setTimeout(() => { quitar.textContent = 'Quitar'; advertencia.remove(); temporizador = null; }, 6000);
      return;
    }
    clearTimeout(temporizador);
    paquete = quitarModelo(paquete, k);
    abiertos.clear();
    pintarLista();
  });

  const nota = nodo('textarea', { rows: '3', maxlength: String(LIMITES.nota), id: `nota-${k}`, placeholder: 'Ej. Versión, fecha de corte o alcance de este modelo.', value: meta.nota ?? '' });
  nota.addEventListener('input', () => cambiaMeta(k, (mt) => ({ ...mt, nota: nota.value })));

  const selColor = nodo('select', { id: `color-${k}` }, CRITERIOS.map((c) => nodo('option', { value: c.id }, c.etiqueta)));
  selColor.value = criterio;
  selColor.addEventListener('change', () => { cambiaMeta(k, (mt) => ({ ...mt, colorPor: selColor.value })); pintarLista(); });

  const filasColor = leyenda(m, criterio, meta.colores?.[criterio], criterio === 'clase' ? baseClase() : {}).map((x) => {
    const entrada = nodo('input', { type: 'color', value: x.color, 'aria-label': `Color de ${x.valor}` });
    entrada.addEventListener('change', () => { setColor(k, criterio, x.valor, entrada.value); pintarLista(); });
    return nodo('div', { class: 'fila-color' },
      entrada,
      nodo('span', { class: 'valor' }, x.valor),
      nodo('span', { class: 'k' }, String(x.n)),
      x.propio
        ? nodo('button', { type: 'button', class: 'btn sec chico', onclick: () => { setColor(k, criterio, x.valor, null); pintarLista(); } }, 'Automático')
        : nodo('span'));
  });

  const pisos = pisosConElementos(m).reverse();
  const filasPisos = pisos.map((p) => filaAlias(p, p, propio(meta.alias?.pisos, p) ?? '', LIMITES.aliasPiso, (v) => setAlias(k, 'pisos', p, v)));
  const filasEjes = (m.ejes ?? []).map((e) => filaAlias(`Eje ${e.etiqueta} (${e.sistema})`, e.etiqueta, propio(meta.alias?.ejes, claveEje(e)) ?? '', LIMITES.aliasEje, (v) => setAlias(k, 'ejes', claveEje(e), v)));

  return nodo('div', { class: 'tarjeta-modelo' },
    cabecera,
    nodo('p', { class: 'nota' }, `${r.n} elementos · acero ${fmtNum(r.peso_acero_kg, 1)} kg · concreto ${fmtNum(r.volumen_concreto_m3, 2)} m³`),
    r.sinCantidad ? nodo('p', { class: 'aviso' }, `${r.sinCantidad} elementos sin cantidades (falta la biblioteca de perfiles, la tabla de secciones o el espesor).`) : '',
    detalle(`${k}:presentacion`, 'Presentación para el cliente',
      nodo('div', { class: 'campo' }, nodo('label', { for: `nota-${k}` }, 'Nota del modelo'), nota),
      nodo('div', { class: 'campo' }, nodo('label', { for: `color-${k}` }, 'Color inicial en el visor (el cliente puede cambiarlo)'), selColor),
      nodo('h3', {}, `Colores · ${CRITERIOS.find((c) => c.id === criterio).etiqueta}`),
      filasColor.length ? filasColor : nodo('p', { class: 'nota' }, 'Sin elementos.'),
      pisos.length ? detalle(`${k}:pisos`, 'Etiquetas de pisos', nodo('p', { class: 'nota' }, 'Solo cambian el texto que ve el cliente; las elevaciones no se tocan.'), filasPisos) : '',
      filasEjes.length ? detalle(`${k}:ejes`, 'Etiquetas de ejes', nodo('p', { class: 'nota' }, `Máximo ${LIMITES.aliasEje} caracteres: caben en la burbuja.`), filasEjes) : ''),
    (m.avisos ?? []).length ? detalle(`${k}:avisos`, `Notas del modelo (${m.avisos.length})`, nodo('ul', {}, m.avisos.map((a) => nodo('li', {}, a)))) : '');
}

function pintarLista() {
  $('lista-modelos').replaceChildren(...paquete.modelos.map(tarjeta));
  $('sin-modelos').hidden = paquete.modelos.length > 0;
}

// ---------- Abrir un paquete existente ----------

$('abrir').addEventListener('click', async () => {
  $('error').hidden = true;
  $('abrir').disabled = true;
  try {
    const archivo = $('abrir-archivo').files?.[0];
    if (!archivo) throw new Error('Elige el archivo .enc.json del paquete.');
    revisaTamano(archivo);
    let sobre;
    try { sobre = JSON.parse(await archivo.text()); } catch { throw new Error('El archivo no es un paquete cifrado válido.'); }
    const clave = $('abrir-clave').value;
    const abierto = await descifrarPaquete(sobre, clave);
    validarPaquete(abierto);
    for (const m of abierto.modelos) m.meta = sanearMeta(m.meta);
    paquete = abierto;
    abiertos.clear();
    const id = ID_ARCHIVO.exec(archivo.name)?.[1];
    if (id) $('idp').value = id;
    $('nombre').value = paquete.nombre;
    $('nota').value = paquete.nota ?? '';
    $('clave').value = clave; // por omisión se conserva la contraseña: el enlace del cliente sigue sirviendo
    $('clave').type = 'password'; // la del cliente no debe quedar a la vista (pantalla compartida)
    $('nota-acceso').textContent = id
      ? 'Con el mismo identificador y la misma contraseña, el enlace del cliente sigue funcionando: solo reemplaza el archivo en models/. '
        + 'Si cambias alguno (botones "Nuevo" y "Generar"), el enlace o la contraseña anterior dejan de servir para esta versión; la versión anterior queda en el historial de git.'
      : 'El nombre del archivo no es un identificador; se conserva el generado. Si es un paquete publicado, renómbralo como <id>.enc.json antes de abrirlo.';
    $('abrir-clave').value = '';
    pintarLista();
  } catch (e) {
    mostrarError(e.message);
  } finally {
    $('abrir').disabled = false;
  }
});

// ---------- Agregar un modelo desde el .e2k ----------

$('n-nombre').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
$('agregar').addEventListener('click', async () => {
  $('error').hidden = true;
  $('agregar').disabled = true;
  try {
    const f = $('nuevo');
    const e2k = await leer(f.querySelector('[data-e2k]'));
    if (e2k === undefined) throw new Error('Elige el archivo .e2k del modelo.');
    const entrada = {
      nombre: f.querySelector('[data-nombre]').value,
      e2k,
      ...(await leerTabla(f.querySelector('[data-tabla]'))),
      unidadTabla: f.querySelector('[data-unidad]').value,
    };
    let usadas;
    try { usadas = bibliotecasUsadas(e2k); } catch (e) { throw new Error(`${entrada.nombre.trim() || `Modelo ${paquete.modelos.length + 1}`}: ${e.message}`); }
    const modelo = construirModeloDeEntrada(entrada, paquete.modelos.length, await obtenerBibliotecas(usadas));
    paquete = agregarModelo(paquete, modelo);
    for (const input of f.querySelectorAll('input')) input.value = '';
    pintarLista();
  } catch (e) {
    mostrarError(e.message);
  } finally {
    $('agregar').disabled = false;
  }
});

// ---------- Acceso y generación ----------

$('generar').addEventListener('click', () => { $('clave').type = 'text'; $('clave').value = generarContrasena(); });
$('nuevo-id').addEventListener('click', () => { $('idp').value = generarIdPaquete(); });
$('idp').value = generarIdPaquete();
$('clave').value = generarContrasena();
pintarLista();

$('forma').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('error').hidden = true;
  $('crear').disabled = true;
  try {
    const final = validarPaquete(renombrarPaquete(fijarNotaPaquete(paquete, $('nota').value), $('nombre').value));
    const sobre = await sellarPaquete(final, $('clave').value);
    const archivo = `${$('idp').value}.enc.json`;
    descargar(archivo, sobre);

    $('resultado').hidden = false;
    $('resultado').replaceChildren(
      nodo('h2', {}, 'Paquete generado'),
      ...final.modelos.map((m) => {
        const r = resumir([...m.frames, ...m.areas]);
        return nodo('div', { class: 'tarjeta' },
          nodo('div', { class: 'fila' }, nodo('b', {}, m.nombre), nodo('span', { class: 'v' }, `${r.n} elementos`)),
          nodo('div', { class: 'fila' }, nodo('span', { class: 'k' }, 'Acero'), nodo('span', { class: 'v' }, `${fmtNum(r.peso_acero_kg, 1)} kg`)),
          nodo('div', { class: 'fila' }, nodo('span', { class: 'k' }, 'Concreto'), nodo('span', { class: 'v' }, `${fmtNum(r.volumen_concreto_m3, 2)} m³`)),
          r.sinCantidad ? nodo('p', { class: 'aviso' }, `${r.sinCantidad} elementos sin cantidades (falta la biblioteca de perfiles, la tabla de secciones o el espesor).`) : '');
      }),
      nodo('p', { class: 'nota' }, 'Pasos: 1) copia el archivo descargado a la carpeta ', nodo('code', {}, 'models/'),
        ' del repositorio (si ya existía, se reemplaza) · 2) súbelo con un pull request · 3) el enlace queda así:'),
      nodo('p', {}, nodo('code', {}, `https://structuraldev.github.io/ETABSviewer/?c=${$('idp').value}`)),
      nodo('p', { class: 'nota' }, 'Comprueba los totales contra el Material Takeoff de ETABS antes de compartir. No guardes la contraseña en el repositorio.'),
    );
  } catch (e) {
    mostrarError(e.message);
  } finally {
    $('crear').disabled = false;
  }
});

// ---------- Bibliotecas de perfiles guardadas en el navegador ----------

async function pintarBibliotecas() {
  let todas = {};
  try { todas = await leerBibliotecas(); } catch { /* IndexedDB no disponible: se trabaja sin bibliotecas guardadas */ }
  const lista = $('lista-bibliotecas');
  lista.replaceChildren(...(Object.keys(todas).length === 0
    ? [nodo('li', {}, 'Aún no hay bibliotecas cargadas.')]
    : Object.entries(todas).map(([nombre, b]) => nodo('li', {},
      `${nombre} · ${Object.keys(b.perfiles).length} perfiles `,
      nodo('button', { type: 'button', class: 'btn sec chico', 'data-borrar': nombre }, 'Quitar')))));
}

$('lista-bibliotecas').addEventListener('click', async (ev) => {
  const nombre = ev.target.dataset?.borrar;
  if (nombre) { await borrarBiblioteca(nombre); pintarBibliotecas(); }
});

$('bibliotecas').addEventListener('change', async (ev) => {
  $('error').hidden = true;
  try {
    for (const archivo of ev.target.files) {
      revisaTamano(archivo);
      const datos = parsearBibliotecaCsi(await archivo.text());
      await guardarBiblioteca(archivo.name.replace(/\.[^.]+$/, ''), datos);
    }
  } catch (e) {
    mostrarError(e.message);
  }
  ev.target.value = '';
  pintarBibliotecas();
});

pintarBibliotecas();
