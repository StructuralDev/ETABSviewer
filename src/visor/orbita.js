// Control de cámara orbital mínimo (sin depender de OrbitControls), perspectiva u ortográfica.
//   rueda: zoom · rueda (botón central) arrastrando: desplaza · Mayús + rueda arrastrando: gira
//   botón derecho arrastrando: desplaza · dos dedos: gira/zoom/desplaza
// El botón izquierdo NO mueve la cámara: lo usa el visor para seleccionar.
import * as THREE from 'three';

const FOV_REFERENCIA = 45; // grados; el tamaño de la vista ortográfica equivale al de la perspectiva
const tanMedioFov = Math.tan((FOV_REFERENCIA * Math.PI) / 360);

export class Orbita {
  constructor(camara, dom) {
    this.camara = camara;
    this.dom = dom;
    this.objetivo = new THREE.Vector3();
    this.radio = 20;
    this.azimut = Math.PI / 4;
    this.elevacion = Math.PI / 6;
    this.alCambiar = () => {};
    this._punteros = new Map();
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => this._abajo(e));
    dom.addEventListener('pointermove', (e) => this._mueve(e));
    dom.addEventListener('pointerup', (e) => this._arriba(e));
    dom.addEventListener('pointercancel', (e) => this._arriba(e));
    dom.addEventListener('wheel', (e) => this._rueda(e), { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // sin autodesplazamiento
    this.actualizar();
  }

  usarCamara(camara) {
    this.camara = camara;
    this.actualizar();
  }

  actualizar() {
    const { azimut: a, elevacion: el, radio: r, camara } = this;
    camara.position.set(
      this.objetivo.x + r * Math.cos(el) * Math.sin(a),
      this.objetivo.y + r * Math.sin(el),
      this.objetivo.z + r * Math.cos(el) * Math.cos(a),
    );
    camara.near = r / 200;
    camara.far = r * 200;
    if (camara.isOrthographicCamera) this._ajustaOrtografica();
    camara.updateProjectionMatrix();
    camara.lookAt(this.objetivo);
    this.alCambiar();
  }

  _ajustaOrtografica() {
    const h = this.radio * tanMedioFov;
    const aspecto = (this.dom.clientWidth || 1) / (this.dom.clientHeight || 1);
    Object.assign(this.camara, { top: h, bottom: -h, left: -h * aspecto, right: h * aspecto });
  }

  orientar(azimut, elevacion) {
    this.azimut = azimut;
    this.elevacion = Math.min(Math.PI / 2 - 1e-3, Math.max(-Math.PI / 2 + 1e-3, elevacion));
    this.actualizar();
  }

  // Centra la caja (THREE.Box3) y ajusta el zoom para que quepa en pantalla con la orientación actual.
  encuadrar(caja) {
    if (caja.isEmpty()) return;
    this.objetivo.copy(caja.getCenter(new THREE.Vector3()));
    this.actualizar();
    this.camara.updateMatrixWorld();
    const aVista = new THREE.Matrix4().copy(this.camara.matrixWorld).invert();
    let w = 0, h = 0, prof = 0;
    for (const x of [caja.min.x, caja.max.x]) for (const y of [caja.min.y, caja.max.y]) for (const z of [caja.min.z, caja.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(aVista);
      w = Math.max(w, Math.abs(p.x));
      h = Math.max(h, Math.abs(p.y));
      prof = Math.max(prof, Math.abs(p.z + this.radio)); // profundidad respecto al objetivo (a -radio de la cámara)
    }
    const aspecto = (this.dom.clientWidth || 1) / (this.dom.clientHeight || 1);
    const medioAlto = Math.max(h, w / aspecto) * 1.12 || 1;
    // Ortográfica: el radio solo fija la distancia y la escala. Perspectiva: se aleja lo suficiente
    // para ver el objeto completo, con margen por su profundidad.
    this.radio = this.camara.isOrthographicCamera
      ? Math.max(medioAlto / tanMedioFov, prof * 2)
      : medioAlto / tanMedioFov + prof;
    this.actualizar();
  }

  _abajo(e) {
    this._punteros.set(e.pointerId, { x: e.clientX, y: e.clientY, boton: e.button, shift: e.shiftKey });
    this.dom.setPointerCapture(e.pointerId);
  }

  _mueve(e) {
    const p = this._punteros.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (this._punteros.size === 2) {
      // Dos dedos: zoom por cambio de distancia y desplazamiento por el punto medio.
      const otro = [...this._punteros.entries()].find(([id]) => id !== e.pointerId)[1];
      const antes = Math.hypot(p.x - otro.x, p.y - otro.y);
      const despues = Math.hypot(e.clientX - otro.x, e.clientY - otro.y);
      if (despues > 0) this.radio *= antes / despues;
      this._desplazar(dx / 2, dy / 2);
    } else if (p.boton === 1 && (p.shift || e.shiftKey)) {
      this._girar(dx, dy);
    } else if (p.boton === 1 || p.boton === 2) {
      this._desplazar(dx, dy);
    } else {
      return; // botón izquierdo: lo gestiona el visor (selección)
    }
    p.x = e.clientX;
    p.y = e.clientY;
    this.actualizar();
  }

  _arriba(e) {
    this._punteros.delete(e.pointerId);
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
  }

  _rueda(e) {
    e.preventDefault();
    this.radio *= Math.exp(e.deltaY * 0.0012);
    this.actualizar();
  }

  _girar(dx, dy) {
    this.azimut -= dx * 0.008;
    this.elevacion = Math.min(Math.PI / 2 - 1e-3, Math.max(-Math.PI / 2 + 1e-3, this.elevacion + dy * 0.008));
  }

  _desplazar(dx, dy) {
    const alto = this.dom.clientHeight || 1;
    const k = (2 * this.radio * tanMedioFov) / alto;
    const derecha = new THREE.Vector3().setFromMatrixColumn(this.camara.matrix, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(this.camara.matrix, 1);
    this.objetivo.addScaledVector(derecha, -dx * k).addScaledVector(arriba, dy * k);
  }
}
