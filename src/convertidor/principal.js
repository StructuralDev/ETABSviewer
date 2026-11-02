// Convertidor: lee .e2k (y tabla de secciones), construye los modelos y descarga el paquete cifrado.
import { construirPaquete, sellarPaquete, generarIdPaquete, generarContrasena } from '../core/paquete.js';
import { resumir } from '../core/resumen.js';
import { leerXlsx } from '../core/xlsx.js';
import { parsearBibliotecaCsi } from '../core/biblioteca.js';
import { guardarBiblioteca, borrarBiblioteca, leerBibliotecas } from './bibliotecas.js';

const $ = (id) => document.getElementById(id);
const UNIDADES_TABLA = ['M', 'CM', 'MM', 'IN', 'FT'];

function nodo(tag, props = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return n;
}

let contador = 0;
function agregarModelo() {
  const k = ++contador;
  const fila = nodo('div', { class: 'modelo', 'data-fila': '' },
    nodo('div', { class: 'campo' },
      nodo('label', { for: `n${k}` }, 'Nombre del modelo'),
      nodo('input', { id: `n${k}`, type: 'text', 'data-nombre': '', placeholder: 'Ej. Torre A', required: '' })),
    nodo('div', { class: 'campo' },
      nodo('label', { for: `e${k}` }, 'Archivo .e2k'),
      nodo('input', { id: `e${k}`, type: 'file', accept: '.e2k,.txt', 'data-e2k': '', required: '' })),
    nodo('div', { class: 'dos' },
      nodo('div', { class: 'campo' },
        nodo('label', { for: `t${k}` }, 'Tabla de secciones, .xlsx o .csv (opcional)'),
        nodo('input', { id: `t${k}`, type: 'file', accept: '.xlsx,.csv,.txt,.tsv', 'data-tabla': '' })),
      nodo('div', { class: 'campo' },
        nodo('label', { for: `u${k}` }, 'Unidad de la tabla (solo si no trae fila de unidades)'),
        nodo('select', { id: `u${k}`, 'data-unidad': '' }, UNIDADES_TABLA.map((u) => nodo('option', { value: u }, u.toLowerCase())))),
    ),
  );
  $('modelos').append(fila);
}

const leer = (input) => input?.files?.[0]?.text() ?? Promise.resolve(undefined);

// La tabla de secciones puede ser Excel (.xlsx) o texto (.csv/.tsv/.txt).
async function leerTabla(input) {
  const archivo = input?.files?.[0];
  if (!archivo) return {};
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

$('agregar').addEventListener('click', agregarModelo);
$('generar').addEventListener('click', () => { $('clave').value = generarContrasena(); });
$('idp').value = generarIdPaquete();
$('clave').value = generarContrasena();
agregarModelo();

$('forma').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('error').hidden = true;
  $('crear').disabled = true;
  try {
    const entradas = [];
    for (const f of document.querySelectorAll('[data-fila]')) {
      entradas.push({
        nombre: f.querySelector('[data-nombre]').value,
        e2k: await leer(f.querySelector('[data-e2k]')),
        ...(await leerTabla(f.querySelector('[data-tabla]'))),
        unidadTabla: f.querySelector('[data-unidad]').value,
      });
    }
    const paquete = construirPaquete($('nombre').value, entradas, await leerBibliotecas());
    const sobre = await sellarPaquete(paquete, $('clave').value);
    const archivo = `${$('idp').value}.enc.json`;
    descargar(archivo, sobre);

    $('resultado').hidden = false;
    $('resultado').replaceChildren(
      nodo('h2', {}, 'Paquete generado'),
      ...paquete.modelos.map((m) => {
        const r = resumir([...m.frames, ...m.areas]);
        return nodo('div', { class: 'tarjeta' },
          nodo('div', { class: 'fila' }, nodo('b', {}, m.nombre), nodo('span', { class: 'v' }, `${r.n} elementos`)),
          nodo('div', { class: 'fila' }, nodo('span', { class: 'k' }, 'Acero'), nodo('span', { class: 'v' }, `${r.peso_acero_kg.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg`)),
          nodo('div', { class: 'fila' }, nodo('span', { class: 'k' }, 'Concreto'), nodo('span', { class: 'v' }, `${r.volumen_concreto_m3.toLocaleString('es-MX', { maximumFractionDigits: 2 })} m³`)),
          r.sinCantidad ? nodo('p', { class: 'aviso' }, `${r.sinCantidad} elementos sin cantidades (falta la biblioteca de perfiles, la tabla de secciones o el espesor).`) : '',
          nodo('details', {}, nodo('summary', {}, `Notas (${m.avisos.length})`), nodo('ul', {}, m.avisos.map((a) => nodo('li', {}, a)))));
      }),
      nodo('p', { class: 'nota' }, 'Pasos: 1) copia el archivo descargado a la carpeta ', nodo('code', {}, 'models/'),
        ' del repositorio · 2) súbelo con un pull request · 3) el enlace queda así:'),
      nodo('p', {}, nodo('code', {}, `https://<usuario>.github.io/<repositorio>/?c=${$('idp').value}`)),
      nodo('p', { class: 'nota' }, 'Comprueba los totales contra el Material Takeoff de ETABS antes de compartir. No guardes la contraseña en el repositorio.'),
    );
    $('idp').value = generarIdPaquete(); // el siguiente paquete usa otro identificador
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
      nodo('button', { type: 'button', class: 'btn sec', 'data-borrar': nombre, style: 'height:24px;padding:0 8px;font-size:12px' }, 'Quitar')))));
}

$('lista-bibliotecas').addEventListener('click', async (ev) => {
  const nombre = ev.target.dataset?.borrar;
  if (nombre) { await borrarBiblioteca(nombre); pintarBibliotecas(); }
});

$('bibliotecas').addEventListener('change', async (ev) => {
  $('error').hidden = true;
  try {
    for (const archivo of ev.target.files) {
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
