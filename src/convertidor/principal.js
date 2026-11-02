// Convertidor: lee .e2k (y tabla de secciones), construye los modelos y descarga el paquete cifrado.
import { construirPaquete, sellarPaquete, generarIdPaquete, generarContrasena } from '../core/paquete.js';
import { resumir } from '../core/resumen.js';

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
        nodo('label', { for: `t${k}` }, 'Tabla Frame Section Properties (opcional)'),
        nodo('input', { id: `t${k}`, type: 'file', accept: '.csv,.txt,.tsv', 'data-tabla': '' })),
      nodo('div', { class: 'campo' },
        nodo('label', { for: `u${k}` }, 'Unidad de longitud de la tabla (si no la indica)'),
        nodo('select', { id: `u${k}`, 'data-unidad': '' }, UNIDADES_TABLA.map((u) => nodo('option', { value: u }, u.toLowerCase())))),
    ),
  );
  $('modelos').append(fila);
}

const leer = (input) => input?.files?.[0]?.text() ?? Promise.resolve(undefined);

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
        tabla: await leer(f.querySelector('[data-tabla]')),
        unidadTabla: f.querySelector('[data-unidad]').value,
      });
    }
    const paquete = construirPaquete($('nombre').value, entradas);
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
          r.sinCantidad ? nodo('p', { class: 'aviso' }, `${r.sinCantidad} elementos sin cantidades (falta la tabla de secciones o el espesor).`) : '',
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
