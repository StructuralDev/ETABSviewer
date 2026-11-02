// Punto de entrada del visor: pide la contraseña, descifra el paquete y arranca la vista 3D.
import { descifrarPaquete } from '../core/cripto.js';
import { Visor } from './app.js';

const $ = (id) => document.getElementById(id);
const ID_VALIDO = /^[A-Za-z0-9_-]{4,64}$/;

const idPaquete = new URLSearchParams(location.search).get('c');
const mensaje = $('login-mensaje');
let sobre = null;

function error(texto) {
  mensaje.textContent = texto;
  mensaje.hidden = false;
}

async function cargarSobre() {
  if (!idPaquete || !ID_VALIDO.test(idPaquete)) {
    error('El enlace no es válido. Pide a quien te lo compartió que lo verifique.');
    $('login-form').hidden = true;
    return;
  }
  try {
    const r = await fetch(`models/${idPaquete}.enc.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    sobre = await r.json();
  } catch {
    error('No se encontró el paquete de modelos. Verifica el enlace.');
    $('login-form').hidden = true;
  }
}

function abrir(paquete) {
  $('login').hidden = true;
  $('app').hidden = false;
  document.title = `${paquete.nombre} · Visor ETABS`;
  $('titulo').textContent = paquete.nombre;

  const visor = new Visor({ contenedor: $('lienzo'), panel: $('panel'), cajaSeleccion: $('caja') });
  const sel = $('modelo-sel');
  sel.replaceChildren(...paquete.modelos.map((m, k) => new Option(m.nombre, String(k))));
  sel.hidden = paquete.modelos.length < 2;
  sel.addEventListener('change', () => visor.cargarModelo(paquete.modelos[Number(sel.value)]));

  for (const b of document.querySelectorAll('[data-vista]')) b.addEventListener('click', () => visor.vista(b.dataset.vista));
  for (const b of document.querySelectorAll('[data-modo]')) {
    b.addEventListener('click', () => {
      visor.fijaModo(b.dataset.modo);
      for (const o of document.querySelectorAll('[data-modo]')) o.setAttribute('aria-pressed', String(o === b));
    });
  }
  visor.cargarModelo(paquete.modelos[0]);
}

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!sobre) return;
  const boton = $('login-boton');
  boton.disabled = true;
  mensaje.hidden = true;
  try {
    abrir(await descifrarPaquete(sobre, $('clave').value));
  } catch (e) {
    error(e.message);
    $('clave').select();
  } finally {
    boton.disabled = false;
  }
});

cargarSobre();
