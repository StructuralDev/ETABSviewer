// Control de cámara orbital mínimo (sin depender de OrbitControls).
// Botón izquierdo/un dedo: gira · botón derecho/dos dedos: desplaza · rueda/pellizco: zoom.
import * as THREE from 'three';

export class Orbita {
  constructor(camara, dom) {
    this.camara = camara;
    this.dom = dom;
    this.objetivo = new THREE.Vector3();
    this.radio = 20;
    this.azimut = Math.PI / 4;
    this.elevacion = Math.PI / 6;
    this.giroIzquierdoActivo = true; // false cuando el botón izquierdo se usa para seleccionar con caja
    this.alCambiar = () => {};
    this._punteros = new Map();
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => this._abajo(e));
    dom.addEventListener('pointermove', (e) => this._mueve(e));
    dom.addEventListener('pointerup', (e) => this._arriba(e));
    dom.addEventListener('pointercancel', (e) => this._arriba(e));
    dom.addEventListener('wheel', (e) => this._rueda(e), { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.actualizar();
  }

  actualizar() {
    const { azimut: a, elevacion: el, radio: r } = this;
    this.camara.position.set(
      this.objetivo.x + r * Math.cos(el) * Math.sin(a),
      this.objetivo.y + r * Math.sin(el),
      this.objetivo.z + r * Math.cos(el) * Math.cos(a),
    );
    this.camara.near = r / 200;
    this.camara.far = r * 200;
    this.camara.updateProjectionMatrix();
    this.camara.lookAt(this.objetivo);
    this.alCambiar();
  }

  // Encuadra una caja (THREE.Box3) manteniendo la dirección de vista actual.
  encuadrar(caja) {
    if (caja.isEmpty()) return;
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    this.objetivo.copy(esfera.center);
    this.radio = (esfera.radius / Math.sin((this.camara.fov * Math.PI) / 360)) * 1.1;
    this.actualizar();
  }

  vista(nombre) {
    if (nombre === 'planta') { this.azimut = 0; this.elevacion = Math.PI / 2 - 1e-3; }
    else if (nombre === 'frente') { this.azimut = 0; this.elevacion = 0; }
    else { this.azimut = Math.PI / 4; this.elevacion = Math.PI / 6; }
    this.actualizar();
  }

  _abajo(e) {
    this._punteros.set(e.pointerId, { x: e.clientX, y: e.clientY, boton: e.button });
    this.dom.setPointerCapture(e.pointerId);
  }

  _mueve(e) {
    const p = this._punteros.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (this._punteros.size === 2) {
      // Dos dedos: zoom por cambio de distancia y desplazamiento por el punto medio.
      const [a, b] = [...this._punteros.values()];
      const antes = Math.hypot(a.x - b.x, a.y - b.y);
      const otro = [...this._punteros.entries()].find(([id]) => id !== e.pointerId)[1];
      const despues = Math.hypot(e.clientX - otro.x, e.clientY - otro.y);
      if (antes > 0) this.radio *= antes / despues;
      this._desplazar(dx / 2, dy / 2);
    } else if (p.boton === 2 || (p.boton === 1)) {
      this._desplazar(dx, dy);
    } else if (this.giroIzquierdoActivo && p.boton === 0) {
      this.azimut -= dx * 0.008;
      this.elevacion = Math.min(Math.PI / 2 - 1e-3, Math.max(-Math.PI / 2 + 1e-3, this.elevacion + dy * 0.008));
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

  _desplazar(dx, dy) {
    const alto = this.dom.clientHeight || 1;
    const k = (2 * this.radio * Math.tan((this.camara.fov * Math.PI) / 360)) / alto;
    const derecha = new THREE.Vector3().setFromMatrixColumn(this.camara.matrix, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(this.camara.matrix, 1);
    this.objetivo.addScaledVector(derecha, -dx * k).addScaledVector(arriba, dy * k);
  }
}
