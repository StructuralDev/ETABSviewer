// Visor 3D: dibuja el modelo, gestiona la selección y llena el panel de información.
import * as THREE from 'three';
import { Orbita } from './orbita.js';
import { geometriaFrame, geometriaArea } from './geometria.js';
import { resumir } from '../core/resumen.js';
import { M2_A_CM2 } from '../core/unidades.js';

const TIPOS = { viga: 'Viga', columna: 'Columna', contraviento: 'Contraviento', losa: 'Losa', muro: 'Muro', rampa: 'Rampa' };
const MAX_FILAS_LISTA = 500;
const UMBRAL_CLIC_PX = 5;

const fmt = (n, d = 2) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

// Crea un nodo DOM; el texto siempre entra por textContent (los nombres vienen del archivo).
function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') nodo.className = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo.setAttribute(k, v);
  }
  for (const h of hijos.flat()) nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return nodo;
}

const colorToken = (nombre) =>
  new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(nombre).trim());

export class Visor {
  constructor({ contenedor, panel, cajaSeleccion }) {
    this.contenedor = contenedor;
    this.panel = panel;
    this.cajaEl = cajaSeleccion;
    this.modo = 'uno'; // uno | varios | caja
    this.modelo = null;
    this.seleccion = new Set();
    this._pendiente = false;

    this.escena = new THREE.Scene();
    this.escena.background = colorToken('--alba-fondo-marco');
    this.camara = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    contenedor.append(this.renderer.domElement);

    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(0.5, 1, 0.8);
    this.escena.add(sol);

    this.mat = {
      acero: new THREE.MeshLambertMaterial({ color: colorToken('--alba-primary-300') }),
      concreto: new THREE.MeshLambertMaterial({ color: colorToken('--alba-neutral-300'), side: THREE.DoubleSide }),
      otro: new THREE.MeshLambertMaterial({ color: colorToken('--alba-neutral-500'), side: THREE.DoubleSide }),
      seleccion: new THREE.MeshLambertMaterial({ color: colorToken('--alba-warning-500'), side: THREE.DoubleSide }),
    };

    this.orbita = new Orbita(this.camara, this.renderer.domElement);
    this.orbita.alCambiar = () => this.pedirRender();
    this._shift = false;
    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this._shift = true; this._ajustaGiro(); });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this._shift = false; this._ajustaGiro(); });
    this._conectaPuntero();

    new ResizeObserver(() => this._redimensiona()).observe(contenedor);
    this._redimensiona();
  }

  // ---------- Modelo ----------

  cargarModelo(modelo) {
    if (this.grupo) {
      this.escena.remove(this.grupo);
      this.grupo.traverse((o) => o.geometry?.dispose());
    }
    this.modelo = modelo;
    this.seleccion.clear();
    this.grupo = new THREE.Group();
    this.mallas = [];
    for (const f of modelo.frames) {
      this._agrega(new THREE.Mesh(geometriaFrame(f, modelo.secciones[f.seccion]), this.mat[f.clase] ?? this.mat.otro), f);
    }
    for (const a of modelo.areas) {
      this._agrega(new THREE.Mesh(geometriaArea(a), this.mat[a.clase] ?? this.mat.otro), a);
    }
    this.escena.add(this.grupo);
    this.orbita.vista('3d');
    this.orbita.encuadrar(new THREE.Box3().setFromObject(this.grupo));
    this.actualizaPanel();
  }

  _agrega(malla, elemento) {
    malla.userData.el = elemento;
    malla.geometry.computeBoundingSphere();
    this.grupo.add(malla);
    this.mallas.push(malla);
  }

  vista(nombre) {
    this.orbita.vista(nombre);
    this.orbita.encuadrar(new THREE.Box3().setFromObject(this.grupo));
  }

  fijaModo(modo) {
    this.modo = modo;
    this._ajustaGiro();
  }

  _ajustaGiro() {
    this.orbita.giroIzquierdoActivo = !(this.modo === 'caja' || this._shift);
  }

  // ---------- Selección ----------

  limpiarSeleccion() {
    this._aplica(new Set());
  }

  _aplica(nueva) {
    for (const m of this.seleccion) if (!nueva.has(m)) m.material = this.mat[m.userData.el.clase] ?? this.mat.otro;
    for (const m of nueva) m.material = this.mat.seleccion;
    this.seleccion = nueva;
    this.actualizaPanel();
    this.pedirRender();
  }

  _conectaPuntero() {
    const dom = this.renderer.domElement;
    let inicio = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      inicio = { x: e.clientX, y: e.clientY, caja: this.modo === 'caja' || e.shiftKey, t: performance.now() };
    });
    dom.addEventListener('pointermove', (e) => {
      if (!inicio?.caja) return;
      const r = dom.getBoundingClientRect();
      const x0 = Math.min(inicio.x, e.clientX) - r.left, y0 = Math.min(inicio.y, e.clientY) - r.top;
      Object.assign(this.cajaEl.style, {
        display: 'block', left: `${x0}px`, top: `${y0}px`,
        width: `${Math.abs(e.clientX - inicio.x)}px`, height: `${Math.abs(e.clientY - inicio.y)}px`,
      });
    });
    dom.addEventListener('pointerup', (e) => {
      if (!inicio || e.button !== 0) return;
      const mueve = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > UMBRAL_CLIC_PX;
      this.cajaEl.style.display = 'none';
      const aditivo = e.ctrlKey || e.metaKey || e.shiftKey;
      if (inicio.caja && mueve) this._seleccionaCaja(inicio, e, aditivo);
      else if (!mueve) this._seleccionaClic(e, aditivo);
      inicio = null;
    });
  }

  _seleccionaClic(e, aditivo) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(ndc, this.camara);
    const golpe = rayo.intersectObjects(this.mallas, false)[0]?.object;
    const sumar = aditivo || this.modo === 'varios';
    const nueva = sumar ? new Set(this.seleccion) : new Set();
    if (golpe) {
      if (sumar && nueva.has(golpe)) nueva.delete(golpe);
      else nueva.add(golpe);
    }
    this._aplica(nueva);
  }

  // Selecciona los elementos cuyo centro proyectado cae dentro del rectángulo arrastrado.
  _seleccionaCaja(a, b, aditivo) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const x0 = Math.min(a.x, b.clientX), x1 = Math.max(a.x, b.clientX);
    const y0 = Math.min(a.y, b.clientY), y1 = Math.max(a.y, b.clientY);
    const nueva = aditivo ? new Set(this.seleccion) : new Set();
    const v = new THREE.Vector3();
    for (const m of this.mallas) {
      v.copy(m.geometry.boundingSphere.center).project(this.camara);
      if (v.z > 1) continue; // detrás de la cámara
      const px = ((v.x + 1) / 2) * r.width + r.left, py = ((1 - v.y) / 2) * r.height + r.top;
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) nueva.add(m);
    }
    this._aplica(nueva);
  }

  // ---------- Render ----------

  pedirRender() {
    if (this._pendiente) return;
    this._pendiente = true;
    requestAnimationFrame(() => {
      this._pendiente = false;
      this.renderer.render(this.escena, this.camara);
    });
  }

  _redimensiona() {
    const w = this.contenedor.clientWidth, h = this.contenedor.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camara.aspect = w / h;
    this.camara.updateProjectionMatrix();
    this.pedirRender();
  }

  // ---------- Panel ----------

  actualizaPanel() {
    const elems = [...this.seleccion].map((m) => m.userData.el);
    this.panel.replaceChildren(
      elems.length === 0 ? this._panelModelo() : elems.length === 1 ? this._panelElemento(elems[0]) : this._panelVarios(elems),
    );
  }

  _fila(k, v) {
    return el('div', { class: 'fila' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
  }

  _bloqueCantidades(r) {
    return el('div', { class: 'tarjeta' },
      this._fila('Peso de acero', `${fmt(r.peso_acero_kg)} kg  (${fmt(r.peso_acero_kg / 1000, 3)} t)`),
      this._fila('Volumen de concreto', `${fmt(r.volumen_concreto_m3, 3)} m³`),
      r.volumen_otro_m3 > 0 ? this._fila('Volumen de otros materiales', `${fmt(r.volumen_otro_m3, 3)} m³`) : '',
      r.longitud_m > 0 ? this._fila('Longitud total de barras', `${fmt(r.longitud_m)} m`) : '',
      r.area_m2 > 0 ? this._fila('Área de losas y muros', `${fmt(r.area_m2)} m²`) : '',
    );
  }

  _panelModelo() {
    const todos = [...this.modelo.frames, ...this.modelo.areas];
    const r = resumir(todos);
    const tipos = Object.entries(r.porTipo).map(([t, n]) => `${n} ${(TIPOS[t] ?? t).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ');
    const avisos = this.modelo.avisos ?? [];
    return el('div', {},
      el('h2', {}, this.modelo.nombre),
      el('p', { class: 'nota' }, `${r.n} elementos: ${tipos}`),
      this._bloqueCantidades(r),
      r.sinCantidad > 0 ? el('p', { class: 'aviso' }, `${r.sinCantidad} elementos sin cantidades (sin área de sección o espesor).`) : '',
      el('p', { class: 'nota' }, 'Haz clic en un elemento para ver sus datos. Ctrl o Mayús + clic suma elementos; Mayús + arrastrar selecciona con caja.'),
      avisos.length ? el('details', {}, el('summary', {}, `Notas del modelo (${avisos.length})`), el('ul', {}, avisos.map((a) => el('li', {}, a)))) : '',
    );
  }

  _panelElemento(e) {
    const esFrame = Boolean(e.i);
    const sec = esFrame ? this.modelo.secciones[e.seccion] : null;
    const pt = (p) => p.map((c) => fmt(c, 3)).join(', ');
    const filas = [
      this._fila('Tipo', TIPOS[e.tipo] ?? e.tipo),
      this._fila('Piso', e.piso),
      this._fila('Sección', e.seccion ?? '—'),
      this._fila('Material', e.material ?? '—'),
    ];
    if (esFrame) {
      filas.push(
        this._fila('Longitud', `${fmt(e.longitud_m, 3)} m`),
        this._fila('Extremo I (x, y, z)', `${pt(e.i)} m`),
        this._fila('Extremo J (x, y, z)', `${pt(e.j)} m`),
        this._fila('Giro de sección', `${fmt(e.ang_grados, 1)}°`),
        this._fila('Área de sección', sec?.area_m2 ? `${fmt(sec.area_m2 * M2_A_CM2)} cm²` : '—'),
      );
    } else {
      filas.push(
        this._fila('Área', `${fmt(e.area_m2, 3)} m²`),
        this._fila('Espesor', e.espesor_m === null ? '—' : `${fmt(e.espesor_m, 3)} m`),
        this._fila('Vértices (x, y, z)', e.pts.map((p) => pt(p)).join('  |  ')),
      );
    }
    const cant = [];
    if (e.volumen_m3 === null) cant.push(el('p', { class: 'aviso' }, 'Sin cantidades: falta el área de sección o el espesor.'));
    else {
      cant.push(this._fila('Volumen', `${fmt(e.volumen_m3, 4)} m³`));
      if (e.clase === 'acero') cant.push(this._fila('Peso', e.peso_kg === null ? '—' : `${fmt(e.peso_kg)} kg  (${fmt(e.peso_kg / 1000, 4)} t)`));
    }
    return el('div', {},
      el('h2', {}, `${TIPOS[e.tipo] ?? e.tipo} ${e.id}`),
      el('div', { class: 'tarjeta' }, filas),
      el('h3', {}, 'Cantidades'),
      el('div', { class: 'tarjeta destacada' }, cant),
      el('button', { class: 'btn sec', onclick: () => this.limpiarSeleccion() }, 'Limpiar selección'),
    );
  }

  _panelVarios(elems) {
    const r = resumir(elems);
    const tipos = Object.entries(r.porTipo).map(([t, n]) => `${n} ${(TIPOS[t] ?? t).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ');
    const filaDe = (e) => [
      `${e.id} · ${e.piso}`,
      e.seccion ?? '—',
      e.peso_kg === null || e.peso_kg === undefined ? '' : fmt(e.peso_kg),
      e.volumen_m3 === null ? '—' : fmt(e.volumen_m3, 4),
      e.i ? `${fmt(e.longitud_m)} m` : `${fmt(e.area_m2)} m²`,
    ];
    const cab = ['Elemento', 'Sección', 'Peso (kg)', 'Volumen (m³)', 'Geometría'];
    const filas = elems.map(filaDe);
    const copiar = async () => {
      const tsv = [cab, ...filas].map((f) => f.join('\t')).join('\n');
      try { await navigator.clipboard.writeText(tsv); } catch { /* sin permiso de portapapeles */ }
    };
    return el('div', {},
      el('h2', {}, `${r.n} elementos seleccionados`),
      el('p', { class: 'nota' }, tipos),
      this._bloqueCantidades(r),
      r.sinCantidad > 0 ? el('p', { class: 'aviso' }, `${r.sinCantidad} sin cantidades.`) : '',
      el('div', { class: 'acciones' },
        el('button', { class: 'btn sec', onclick: () => this.limpiarSeleccion() }, 'Limpiar'),
        el('button', { class: 'btn sec', onclick: copiar }, 'Copiar tabla')),
      el('div', { class: 'lista' }, el('table', {},
        el('thead', {}, el('tr', {}, cab.map((c) => el('th', {}, c)))),
        el('tbody', {}, filas.slice(0, MAX_FILAS_LISTA).map((f) => el('tr', {}, f.map((c, k) => el('td', { class: k >= 2 ? 'num' : '' }, c))))))),
      filas.length > MAX_FILAS_LISTA ? el('p', { class: 'nota' }, `…y ${filas.length - MAX_FILAS_LISTA} más (usa "Copiar tabla" para todos).`) : '',
    );
  }
}
