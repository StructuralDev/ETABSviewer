// Visor 3D: dibuja el modelo, gestiona la selección y llena el panel de información.
import * as THREE from 'three';
import { Orbita } from './orbita.js';
import { geometriaFrame, geometriaArea } from './geometria.js';
import { resumir, agruparPor, volumenTotal_m3 } from '../core/resumen.js';
import { M2_A_CM2 } from '../core/unidades.js';
import { elementosDePiso, elementosDeEje, azimutAlzado } from '../core/vistas.js';
import { normalizaRect, modoDeCaja, puntoEnRect, puntosDentro, segmentoTocaRect, poligonoTocaRect } from '../core/caja.js';
import { leyenda, valorDeColor, CRITERIOS } from '../core/colores.js';
import { etiquetaDePiso, etiquetaDeEje } from '../core/gestor.js';

const TIPOS = { viga: 'Viga', columna: 'Columna', contraviento: 'Contraviento', losa: 'Losa', muro: 'Muro', rampa: 'Rampa' };
const CLASES = { acero: 'Acero', concreto: 'Concreto', otro: 'Otro' };
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
  constructor({ contenedor, panel, cajaSeleccion, leyenda: leyendaEl }) {
    this.contenedor = contenedor;
    this.panel = panel;
    this.cajaEl = cajaSeleccion;
    this.leyendaEl = leyendaEl;
    this.modelo = null;
    this.notaPaquete = ''; // nota general del paquete (la fija quien abre el visor)
    this.criterio = 'clase'; // criterio de "Color por" vigente
    this.agrupar = ''; // criterio de subtotales de la tabla de selección ('' = sin agrupar)
    this.seleccion = new Set();
    this._pendiente = false;
    this._materiales = new Map(); // "#rrggbb" -> material
    this._materialesHover = new Map(); // "#rrggbb" -> material un poco más claro para el hover
    this._hover = null; // malla bajo el cursor

    this.escena = new THREE.Scene();
    this.escena.background = colorToken('--alba-fondo-marco');
    this.camPersp = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camOrto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camara = this.camPersp;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    contenedor.append(this.renderer.domElement);

    this.escena.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(0.5, 1, 0.8);
    this.escena.add(sol);

    // Colores de partida de "Acero / concreto"; el resto de los criterios usa la paleta de colores.js.
    this.coloresClase = {
      acero: `#${colorToken('--alba-primary-300').getHexString()}`,
      concreto: `#${colorToken('--alba-neutral-300').getHexString()}`,
      otro: `#${colorToken('--alba-neutral-500').getHexString()}`,
    };
    this.mat = {
      seleccion: new THREE.MeshLambertMaterial({ color: colorToken('--alba-warning-500'), side: THREE.DoubleSide }),
    };

    this.ejesGrupo = new THREE.Group();
    this.escena.add(this.ejesGrupo);
    this.orbita = new Orbita(this.camara, this.renderer.domElement);
    this.orbita.alCambiar = () => this.pedirRender();
    this._conectaPuntero();
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.limpiarSeleccion(); });

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
    this._hover = null; // las mallas anteriores ya no existen
    this.renderer.domElement.style.cursor = '';
    this.criterio = modelo.meta?.colorPor ?? 'clase';
    this._calculaLeyenda();
    this.grupo = new THREE.Group();
    this.mallas = [];
    for (const f of modelo.frames) {
      this._agrega(new THREE.Mesh(geometriaFrame(f, modelo.secciones[f.seccion]), this._materialDe(f)), f);
    }
    for (const a of modelo.areas) {
      this._agrega(new THREE.Mesh(geometriaArea(a), this._materialDe(a)), a);
    }
    this.escena.add(this.grupo);
    this.vista3d();
  }

  // ---------- Color por categoría ----------

  // Leyenda del criterio vigente: colores propios del modelo (meta.colores) sobre los automáticos.
  _calculaLeyenda() {
    this.leyenda = leyenda(this.modelo, this.criterio, this.modelo.meta?.colores?.[this.criterio], this.criterio === 'clase' ? this.coloresClase : {});
    this._colorDe = new Map(this.leyenda.map((x) => [x.valor, x.color]));
    this._pintaLeyenda();
  }

  _materialDe(e) {
    const hex = this._colorDe.get(valorDeColor(e, this.criterio));
    let m = this._materiales.get(hex);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex), side: THREE.DoubleSide });
      this._materiales.set(hex, m);
    }
    return m;
  }

  // Mismo color pero algo más claro (28 % hacia blanco): resalte tenue, distinto del naranja de la selección.
  _materialHoverDe(e) {
    const hex = this._colorDe.get(valorDeColor(e, this.criterio));
    let m = this._materialesHover.get(hex);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.28), side: THREE.DoubleSide });
      this._materialesHover.set(hex, m);
    }
    return m;
  }

  colorearPor(criterio) {
    this._quitaHover();
    this.criterio = criterio;
    this._calculaLeyenda();
    for (const m of this.mallas) if (!this.seleccion.has(m)) m.material = this._materialDe(m.userData.el);
    this.pedirRender();
  }

  _etiquetaDeValor(valor, criterio = this.criterio) {
    switch (criterio) {
      case 'clase': return CLASES[valor] ?? valor;
      case 'tipo': return TIPOS[valor] ?? valor;
      case 'piso': return etiquetaDePiso(this.modelo, valor);
      default: return valor;
    }
  }

  _pintaLeyenda() {
    if (!this.leyendaEl) return;
    this.leyendaEl.replaceChildren(...this.leyenda.map((x) => {
      const muestra = el('span', { class: 'muestra' });
      muestra.style.background = x.color; // CSSOM: permitido por la CSP (no es un atributo style en el HTML)
      return el('div', { class: 'item-leyenda' }, muestra, el('span', { class: 'texto' }, this._etiquetaDeValor(x.valor)), el('span', { class: 'n' }, String(x.n)));
    }));
    this.leyendaEl.hidden = this.leyenda.length === 0;
  }

  _agrega(malla, elemento) {
    malla.userData.el = elemento;
    malla.geometry.computeBoundingSphere();
    this.grupo.add(malla);
    this.mallas.push(malla);
  }

  // ---------- Vistas (3D, planta por piso, alzado por eje) ----------

  _muestra(predicado) {
    this._quitaHover();
    for (const m of this.mallas) m.visible = predicado(m.userData.el);
    const sel = new Set([...this.seleccion].filter((m) => m.visible));
    this._aplica(sel);
  }

  _cajaVisible(conEjes = false) {
    const caja = new THREE.Box3();
    for (const m of this.mallas) if (m.visible) caja.expandByObject(m);
    if (conEjes) caja.expandByObject(this.ejesGrupo);
    return caja;
  }

  _usaCamara(cam) {
    this.camara = cam;
    this.orbita.usarCamara(cam);
  }

  vista3d() {
    this._muestra(() => true);
    this._usaCamara(this.camPersp);
    this.orbita.orientar(Math.PI / 4, Math.PI / 6);
    this.orbita.encuadrar(this._cajaVisible());
    this._dibujaEjes({ modo: '3d' });
  }

  // Planta del piso como en ETABS: objetos asignados a ese piso, vista cenital, norte (+Y) arriba.
  vistaPlanta(piso) {
    const ids = new Set(elementosDePiso(this.modelo, piso));
    this._muestra((e) => ids.has(e));
    this._usaCamara(this.camOrto);
    this.orbita.orientar(0, Math.PI / 2);
    const nivel = this.modelo.pisos.find((p) => p.nombre === piso);
    this._dibujaEjes({ modo: 'planta', z: nivel?.elevacion_m ?? 0 });
    this.orbita.encuadrar(this._cajaVisible(true));
  }

  // Alzado del eje: objetos contenidos en su plano vertical, como la vista de elevación de ETABS.
  vistaAlzado(eje) {
    const ids = new Set(elementosDeEje(this.modelo, eje));
    this._muestra((e) => ids.has(e));
    this._usaCamara(this.camOrto);
    this.orbita.orientar(azimutAlzado(eje), 0);
    this._dibujaEjes({ modo: 'alzado', eje });
    this.orbita.encuadrar(this._cajaVisible(true));
  }

  // Líneas de ejes con sus burbujas. En 3D y planta van horizontales a la altura del nivel; en
  // alzado, los ejes perpendiculares al plano mirado se dibujan como líneas verticales.
  _dibujaEjes({ modo, z, eje }) {
    this.ejesGrupo.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); });
    this.ejesGrupo.clear();
    const ejes = this.modelo.ejes ?? [];
    if (ejes.length === 0) { this.pedirRender(); return; }
    const todos = [...this.modelo.frames.flatMap((f) => [f.i, f.j]), ...this.modelo.areas.flatMap((a) => a.pts)];
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of todos) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    // En 3D las burbujas se alejan bastante de la estructura para no estorbar; en planta y alzado van pegadas.
    const margen = modo === '3d'
      ? Math.max(1.5, 0.2 * Math.max(mx[0] - mn[0], mx[1] - mn[1]))
      : Math.max(0.3, 0.08 * Math.max(mx[0] - mn[0], mx[1] - mn[1], modo === 'alzado' ? mx[2] - mn[2] : 0));
    this._escalaBurbuja = modo === '3d' ? 0.028 : 0.045;
    const opacidad = modo === '3d' ? 0.5 : 0.95;
    const zBase = modo === 'planta' ? z : mn[2];
    const color = colorToken('--alba-neutral-500');
    const pos = [];
    const aThree = (x, y, zz) => [x, zz, -y];
    for (const g of ejes) {
      let a, b;
      if (modo === 'alzado') {
        if (g.dir === eje.dir) continue; // los ejes del mismo sentido son paralelos a la vista
        if (eje.dir === 'Y') { a = [g.coord_m, eje.coord_m, mn[2] - margen / 2]; b = [g.coord_m, eje.coord_m, mx[2] + margen]; }
        else { a = [eje.coord_m, g.coord_m, mn[2] - margen / 2]; b = [eje.coord_m, g.coord_m, mx[2] + margen]; }
      } else if (g.dir === 'X') {
        a = [g.coord_m, mn[1] - margen, zBase]; b = [g.coord_m, mx[1] + margen, zBase];
      } else {
        a = [mn[0] - margen, g.coord_m, zBase]; b = [mx[0] + margen, g.coord_m, zBase];
      }
      pos.push(...aThree(...a), ...aThree(...b));
      this.ejesGrupo.add(this._burbuja(etiquetaDeEje(this.modelo, g), aThree(...(modo === 'alzado' ? b : a)), color, opacidad));
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.ejesGrupo.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: modo === '3d' ? 0.3 : 0.7 })));
    this.pedirRender();
  }

  _burbuja(texto, posicion, color, opacidad) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = `#${color.getHexString()}`;
    g.fillStyle = '#1A1C24';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(32, 32, 28, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.fillStyle = '#F8F8FE';
    // Etiquetas de hasta 6 caracteres (alias): la fuente baja con la longitud y el texto nunca pasa del círculo.
    g.font = `600 ${texto.length > 2 ? Math.min(20, Math.floor(87 / texto.length)) : 28}px Inter, "Segoe UI", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, 32, 33, 50);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false, transparent: true, opacity: opacidad });
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(0.045);
    sp.position.set(...posicion);
    sp.renderOrder = 10;
    return sp;
  }

  // ---------- Selección ----------

  limpiarSeleccion() {
    this._aplica(new Set());
  }

  _aplica(nueva) {
    for (const m of this.seleccion) if (!nueva.has(m)) m.material = this._materialDe(m.userData.el);
    for (const m of nueva) m.material = this.mat.seleccion;
    if (this._hover && !nueva.has(this._hover)) this._hover.material = this._materialHoverDe(this._hover.userData.el);
    this.seleccion = nueva;
    this.actualizaPanel();
    this.pedirRender();
  }

  // Botón izquierdo: clic selecciona; arrastrar dibuja una caja de selección. Ctrl/Cmd/Mayús suma.
  // La cámara se mueve con la rueda (ver orbita.js). Con dos dedos se cancela la caja.
  _conectaPuntero() {
    const dom = this.renderer.domElement;
    let inicio = null;
    const activos = new Set();
    const cancela = () => { inicio = null; this.cajaEl.style.display = 'none'; };
    dom.addEventListener('pointerdown', (e) => {
      activos.add(e.pointerId);
      if (activos.size > 1) return cancela();
      if (e.button !== 0) return;
      inicio = { x: e.clientX, y: e.clientY, arrastra: false };
    });
    dom.addEventListener('pointermove', (e) => {
      // Hover solo con el cursor libre: no mientras se arrastra una caja, se gira o se desplaza.
      if (e.buttons === 0 && e.pointerType !== 'touch') this._pasaPor(e); else this._quitaHover();
      if (!inicio) return;
      if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > UMBRAL_CLIC_PX) inicio.arrastra = true;
      if (!inicio.arrastra) return;
      const r = dom.getBoundingClientRect();
      this.cajaEl.className = modoDeCaja(inicio.x, e.clientX); // 'ventana' (→) o 'cruce' (←), como en CAD
      Object.assign(this.cajaEl.style, {
        display: 'block',
        left: `${Math.min(inicio.x, e.clientX) - r.left}px`, top: `${Math.min(inicio.y, e.clientY) - r.top}px`,
        width: `${Math.abs(e.clientX - inicio.x)}px`, height: `${Math.abs(e.clientY - inicio.y)}px`,
      });
    });
    const termina = (e) => {
      activos.delete(e.pointerId);
      if (!inicio || e.button !== 0) return;
      const aditivo = e.ctrlKey || e.metaKey || e.shiftKey;
      const { arrastra } = inicio;
      const desde = inicio;
      cancela();
      if (arrastra) this._seleccionaCaja(desde, e, aditivo);
      else this._seleccionaClic(e, aditivo);
    };
    dom.addEventListener('pointerleave', () => this._quitaHover());
    dom.addEventListener('pointerup', termina);
    dom.addEventListener('pointercancel', (e) => { activos.delete(e.pointerId); cancela(); });
  }

  // Malla visible más cercana bajo un punto de la ventana (px), o undefined.
  _mallaBajo(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(ndc, this.camara);
    return rayo.intersectObjects(this.mallas.filter((m) => m.visible), false)[0]?.object;
  }

  // Hover: como mucho una consulta por cuadro, con la última posición del cursor.
  _pasaPor(e) {
    this._ultimoPuntero = { x: e.clientX, y: e.clientY };
    if (this._hoverPendiente) return;
    this._hoverPendiente = true;
    requestAnimationFrame(() => {
      this._hoverPendiente = false;
      const p = this._ultimoPuntero;
      if (p) this._fijaHover(this._mallaBajo(p.x, p.y) ?? null);
    });
  }

  _quitaHover() {
    this._ultimoPuntero = null;
    this._fijaHover(null);
  }

  // Lo seleccionado conserva el naranja de la selección; el hover solo toca lo que no está seleccionado.
  _fijaHover(malla) {
    if (malla === this._hover) return;
    const previa = this._hover;
    this._hover = malla;
    if (previa && !this.seleccion.has(previa)) previa.material = this._materialDe(previa.userData.el);
    if (malla && !this.seleccion.has(malla)) malla.material = this._materialHoverDe(malla.userData.el);
    this.renderer.domElement.style.cursor = malla ? 'pointer' : '';
    this.pedirRender();
  }

  _seleccionaClic(e, aditivo) {
    const golpe = this._mallaBajo(e.clientX, e.clientY);
    if (!golpe) return; // clic en vacío no cambia la selección: se limpia con Esc
    const nueva = aditivo ? new Set(this.seleccion) : new Set();
    if (aditivo && nueva.has(golpe)) nueva.delete(golpe);
    else nueva.add(golpe);
    this._aplica(nueva);
  }

  // Punto 3D -> pantalla (px de la ventana); null si queda detrás de la cámara o fuera del volumen.
  _aPantalla(v, r) {
    const p = v.clone().project(this.camara);
    if (p.z > 1 || p.z < -1) return null;
    return [((p.x + 1) / 2) * r.width + r.left, ((1 - p.y) / 2) * r.height + r.top];
  }

  _vertices(malla) {
    if (!malla.userData.verts) {
      const pos = malla.geometry.getAttribute('position');
      malla.userData.verts = Array.from({ length: pos.count }, (_, k) => new THREE.Vector3().fromBufferAttribute(pos, k));
    }
    return malla.userData.verts;
  }

  // Caja estilo CAD. Izquierda -> derecha (ventana): solo lo que queda completamente dentro.
  // Derecha -> izquierda (cruce): todo lo que la toque, aunque sea en parte.
  _seleccionaCaja(a, b, aditivo) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const rect = normalizaRect(a.x, a.y, b.clientX, b.clientY);
    const modo = modoDeCaja(a.x, b.clientX);
    const aThree = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
    const tomados = new Set();
    for (const m of this.mallas) {
      if (!m.visible) continue;
      const pv = this._vertices(m).map((v) => this._aPantalla(v, r));
      if (pv.some((p) => p === null)) continue; // parte detrás de la cámara: no se toma
      if (modo === 'ventana') {
        if (puntosDentro(pv, rect)) tomados.add(m);
        continue;
      }
      const e = m.userData.el;
      let toca = pv.some((p) => puntoEnRect(p, rect));
      if (!toca) {
        const eje = (e.i ? [e.i, e.j] : e.pts).map((p) => this._aPantalla(aThree(p), r));
        if (!eje.includes(null)) toca = e.i ? segmentoTocaRect(eje[0], eje[1], rect) : poligonoTocaRect(eje, rect);
      }
      if (toca) tomados.add(m);
    }
    if (tomados.size === 0) return; // una caja vacía no cambia la selección
    this._aplica(aditivo ? new Set([...this.seleccion, ...tomados]) : tomados);
  }

  // ---------- Render ----------

  pedirRender() {
    if (this._pendiente) return;
    this._pendiente = true;
    requestAnimationFrame(() => {
      this._pendiente = false;
      // Las burbujas de los ejes mantienen tamaño de pantalla: en perspectiva lo da sizeAttenuation=false;
      // en ortográfica la escala del sprite es en unidades del mundo, así que se calcula aquí.
      const escala = (this._escalaBurbuja ?? 0.045) * (this.camara.isOrthographicCamera ? this.camara.top - this.camara.bottom : 1);
      for (const o of this.ejesGrupo.children) if (o.isSprite) o.scale.setScalar(escala);
      this.renderer.render(this.escena, this.camara);
    });
  }

  _redimensiona() {
    const w = this.contenedor.clientWidth, h = this.contenedor.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camPersp.aspect = w / h;
    this.orbita?.actualizar(); // reajusta la cámara ortográfica y vuelve a dibujar
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
    const notaModelo = this.modelo.meta?.nota;
    return el('div', {},
      el('h2', {}, this.modelo.nombre),
      notaModelo ? el('p', { class: 'texto-cliente' }, notaModelo) : '',
      el('p', { class: 'nota' }, `${r.n} elementos: ${tipos}`),
      this._bloqueCantidades(r),
      r.sinCantidad > 0 ? el('p', { class: 'aviso' }, `${r.sinCantidad} elementos sin cantidades (sin área de sección o espesor).`) : '',
      this.notaPaquete ? el('div', {}, el('h3', {}, 'Nota general'), el('p', { class: 'texto-cliente' }, this.notaPaquete)) : '',
      el('p', { class: 'nota' }, 'Clic: selecciona. Caja de izquierda a derecha: solo lo que quede completo dentro; de derecha a izquierda: todo lo que toque. Ctrl o Mayús suma · Esc limpia la selección. Rueda: zoom · arrastrar con la rueda: desplazar · Mayús + arrastrar con la rueda: girar.'),
      avisos.length ? el('details', {}, el('summary', {}, `Notas del modelo (${avisos.length})`), el('ul', {}, avisos.map((a) => el('li', {}, a)))) : '',
    );
  }

  _panelElemento(e) {
    const esFrame = Boolean(e.i);
    const sec = esFrame ? this.modelo.secciones[e.seccion] : null;
    const pt = (p) => p.map((c) => fmt(c, 3)).join(', ');
    const filas = [
      this._fila('Tipo', TIPOS[e.tipo] ?? e.tipo),
      this._fila('Piso', etiquetaDePiso(this.modelo, e.piso)),
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
    );
  }

  _panelVarios(elems) {
    const r = resumir(elems);
    const tipos = Object.entries(r.porTipo).map(([t, n]) => `${n} ${(TIPOS[t] ?? t).toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ');
    const criterio = this.agrupar;
    const geom = (x) => [x.longitud_m > 0 ? `${fmt(x.longitud_m)} m` : '', x.area_m2 > 0 ? `${fmt(x.area_m2)} m²` : ''].filter(Boolean).join(' · ') || '—';
    const peso = (x) => (x.volumen_acero_m3 > 0 ? fmt(x.peso_acero_kg) : '');
    // Fila de un subtotal (grupo) o del total: rótulo, n.º de elementos, peso, volumen y geometría.
    const filaResumen = (rotulo, x) => [rotulo, String(x.n), peso(x), fmt(volumenTotal_m3(x), 4), geom(x)];
    let cab, filas, total;
    if (criterio) {
      cab = ['Grupo', 'Elem.', 'Peso (kg)', 'Vol. (m³)', 'Geom.'];
      filas = agruparPor(elems, criterio, { pisos: this.modelo.pisos.map((p) => p.nombre) })
        .map((g) => filaResumen(this._etiquetaDeValor(g.valor, criterio), g.resumen));
      total = filaResumen('Total', r);
    } else {
      cab = ['Elemento', 'Sección', 'Peso (kg)', 'Vol. (m³)', 'Geom.'];
      filas = elems.map((e) => [
        `${e.id} · ${etiquetaDePiso(this.modelo, e.piso)}`,
        e.seccion ?? '—',
        e.peso_kg === null || e.peso_kg === undefined ? '' : fmt(e.peso_kg),
        e.volumen_m3 === null ? '—' : fmt(e.volumen_m3, 4),
        e.i ? `${fmt(e.longitud_m)} m` : `${fmt(e.area_m2)} m²`,
      ]);
      total = ['Total', `${r.n} elem.`, peso(r), fmt(volumenTotal_m3(r), 4), geom(r)];
    }
    const numerica = criterio ? 1 : 2; // primera columna con números (alineada a la derecha)
    const copiar = async () => {
      const tsv = [cab, ...filas, total].map((f) => f.join('\t')).join('\n');
      try { await navigator.clipboard.writeText(tsv); } catch { /* sin permiso de portapapeles */ }
    };
    const agrupador = el('select', { 'aria-label': 'Agrupar por', class: 'agrupar' },
      el('option', { value: '' }, 'Sin agrupar'),
      CRITERIOS.map((c) => el('option', { value: c.id }, `Subtotales por ${c.etiqueta.toLowerCase()}`)));
    agrupador.value = criterio;
    agrupador.addEventListener('change', () => { this.agrupar = agrupador.value; this.actualizaPanel(); });
    const celdas = (f) => f.map((c, k) => el('td', { class: k >= numerica ? 'num' : '' }, c));
    return el('div', {},
      el('h2', {}, `${r.n} elementos seleccionados`),
      el('p', { class: 'nota' }, tipos),
      this._bloqueCantidades(r),
      r.sinCantidad > 0 ? el('p', { class: 'aviso' }, `${r.sinCantidad} sin cantidades.`) : '',
      el('div', { class: 'acciones' }, agrupador, el('button', { class: 'btn sec', onclick: copiar }, 'Copiar tabla')),
      el('div', { class: 'lista' }, el('table', { class: criterio ? 'grupos' : '' },
        el('thead', {}, el('tr', {}, cab.map((c) => el('th', {}, c)))),
        el('tbody', {}, filas.slice(0, MAX_FILAS_LISTA).map((f) => el('tr', {}, celdas(f)))),
        el('tfoot', {}, el('tr', {}, celdas(total))))),
      filas.length > MAX_FILAS_LISTA ? el('p', { class: 'nota' }, `…y ${filas.length - MAX_FILAS_LISTA} más (usa "Copiar tabla" para todos).`) : '',
    );
  }
}
