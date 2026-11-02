// Punto de entrada del visor: pide la contraseña, descifra el paquete y arranca la vista 3D.
import { descifrarPaquete } from '../core/cripto.js';
import { Visor } from './app.js';
import { pisosConElementos, etiquetaEje } from '../core/vistas.js';

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

  const selPlanta = $('sel-planta'), selAlzado = $('sel-alzado'), btn3d = $('btn-3d');
  const marca = (activo) => {
    btn3d.setAttribute('aria-pressed', String(activo === btn3d));
    for (const s of [selPlanta, selAlzado]) {
      s.classList.toggle('activo', s === activo);
      if (s !== activo) s.selectedIndex = 0; // vuelve al rótulo ("Planta" / "Alzado")
    }
  };
  // Llena los selectores de planta (pisos) y alzado (ejes) con lo definido en el modelo de ETABS.
  const llenaVistas = (modelo) => {
    const pisos = pisosConElementos(modelo).reverse(); // de arriba hacia abajo, como ETABS
    selPlanta.replaceChildren(new Option('Planta', ''), ...pisos.map((p) => new Option(p, p)));
    selPlanta.hidden = pisos.length === 0;
    const ejes = modelo.ejes ?? [];
    const varios = new Set(ejes.map((e) => e.sistema)).size > 1;
    selAlzado.replaceChildren(new Option('Alzado', ''), ...ejes.map((e, k) => new Option(etiquetaEje(e, varios), String(k))));
    selAlzado.hidden = ejes.length === 0;
    marca(btn3d);
  };

  const cargar = (k) => {
    const modelo = paquete.modelos[k];
    visor.cargarModelo(modelo);
    llenaVistas(modelo);
  };
  btn3d.addEventListener('click', () => { visor.vista3d(); marca(btn3d); });
  selPlanta.addEventListener('change', () => {
    if (!selPlanta.value) return;
    visor.vistaPlanta(selPlanta.value);
    marca(selPlanta);
  });
  selAlzado.addEventListener('change', () => {
    if (!selAlzado.value) return;
    visor.vistaAlzado(visor.modelo.ejes[Number(selAlzado.value)]);
    marca(selAlzado);
  });
  sel.addEventListener('change', () => cargar(Number(sel.value)));
  cargar(0);
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
