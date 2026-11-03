// Punto de entrada del visor: pide la contraseña, descifra el paquete y arranca la vista 3D.
import { descifrarPaquete } from '../core/cripto.js';
import { Visor } from './app.js';
import { pisosConElementos, etiquetaEje } from '../core/vistas.js';
import { etiquetaDePiso, etiquetaDeEje, sanearMeta } from '../core/gestor.js';
import { CRITERIOS } from '../core/colores.js';

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

  const visor = new Visor({ contenedor: $('lienzo'), panel: $('panel'), cajaSeleccion: $('caja'), leyenda: $('leyenda') });
  visor.notaPaquete = typeof paquete.nota === 'string' ? paquete.nota : '';
  for (const m of paquete.modelos) m.meta = sanearMeta(m.meta); // paquetes anteriores: sin meta
  const selPlanta = $('sel-planta'), selAlzado = $('sel-alzado'), btn3d = $('btn-3d'), selColor = $('sel-color');
  selColor.replaceChildren(...CRITERIOS.map((c) => new Option(`Color: ${c.etiqueta}`, c.id)));
  selColor.addEventListener('change', () => visor.colorearPor(selColor.value));
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
    selPlanta.replaceChildren(new Option('Planta', ''), ...pisos.map((p) => new Option(etiquetaDePiso(modelo, p), p)));
    selPlanta.hidden = pisos.length === 0;
    const ejes = modelo.ejes ?? [];
    const varios = new Set(ejes.map((e) => e.sistema)).size > 1;
    selAlzado.replaceChildren(new Option('Alzado', ''), ...ejes.map((e, k) => new Option(etiquetaEje({ ...e, etiqueta: etiquetaDeEje(modelo, e) }, varios), String(k))));
    selAlzado.hidden = ejes.length === 0;
    marca(btn3d);
  };

  const cargar = (k) => {
    const modelo = paquete.modelos[k];
    visor.cargarModelo(modelo);
    selColor.value = visor.criterio; // el modelo puede traer su propio color inicial
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

  // Pestañas de modelos: con un solo modelo no se muestran.
  const pestanas = $('pestanas');
  const activa = (k) => {
    for (const b of pestanas.children) b.setAttribute('aria-selected', String(b.dataset.k === String(k)));
  };
  pestanas.replaceChildren(...paquete.modelos.map((m, k) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.dataset.k = String(k);
    b.textContent = m.nombre;
    b.addEventListener('click', () => { cargar(k); activa(k); });
    return b;
  }));
  pestanas.hidden = paquete.modelos.length < 2;
  // ?m=2 abre directamente el tercer modelo (útil para enlaces desde Google Sites).
  const pedido = Number(new URLSearchParams(location.search).get('m'));
  const inicial = Number.isInteger(pedido) && pedido >= 0 && pedido < paquete.modelos.length ? pedido : 0;
  cargar(inicial);
  activa(inicial);

  // Divisor para cambiar el ancho del panel de información.
  const divisor = $('divisor');
  divisor.addEventListener('pointerdown', (e) => {
    divisor.setPointerCapture(e.pointerId);
    divisor.classList.add('arrastrando');
  });
  divisor.addEventListener('pointermove', (e) => {
    if (!divisor.hasPointerCapture(e.pointerId)) return;
    const ancho = Math.min(Math.max(window.innerWidth - e.clientX, 300), window.innerWidth * 0.7);
    document.documentElement.style.setProperty('--panel-w', `${ancho}px`);
  });
  divisor.addEventListener('pointerup', (e) => {
    divisor.releasePointerCapture(e.pointerId);
    divisor.classList.remove('arrastrando');
  });
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
