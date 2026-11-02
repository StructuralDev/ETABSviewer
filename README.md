# Visor de modelos ETABS

Visor 3D para compartir modelos de ETABS con clientes mediante un enlace (incrustable en Google Sites).
Al seleccionar uno o varios elementos muestra su geometría y sus cantidades: **peso** si es acero, **volumen** si es concreto.

- **Visor** (`index.html`): el cliente abre el enlace, escribe la contraseña y ve los modelos.
- **Convertidor** (`convertidor.html`): herramienta interna que lee los archivos de ETABS y genera el paquete **cifrado** que se publica.

## Qué se exporta desde ETABS

1. **`.e2k`** de cada modelo: `File → Export → ETABS .e2k File`. Trae geometría, pisos, materiales y espesores.
2. **Tabla de propiedades de secciones de frame** (solo para el peso del acero): `Display → Show Tables → Model Definition → Section Properties → Frame Section Properties`, y luego `File → Export → Excel`. El `.xlsx` se carga tal cual (también sirve CSV/texto).
   El `.e2k` **no** trae el área de las secciones de catálogo (HSS, W, etc.); sin esta tabla esas secciones se dibujan pero no tienen peso.
   ETABS redondea el área a los decimales de la tabla (p. ej. 0.1 cm²): sube los decimales de la columna Area si necesitas más exactitud.

Unidades de salida: m, m², m³, kg (se convierten desde las unidades del archivo).

## Controles

| Acción | Cómo |
|---|---|
| Seleccionar un elemento | Clic |
| Seleccionar varios | Arrastrar con el botón izquierdo (caja) |
| Sumar o quitar de la selección | Ctrl, Cmd o Mayús + clic o caja |
| Zoom | Rueda |
| Desplazar (pan) | Arrastrar con la rueda (botón central); también botón derecho |
| Girar | Mayús + arrastrar con la rueda; en pantalla táctil, dos dedos |

**Vistas** (barra superior): `3D`; `Planta` (elige un piso: muestra los objetos asignados a ese piso, vista cenital con el norte, +Y, arriba); `Alzado` (elige un eje de la cuadrícula de ETABS: muestra los objetos contenidos en su plano, mirando desde −Y para ejes numéricos y desde +X para ejes con letra). Planta y alzado usan cámara ortográfica y dibujan los ejes con sus burbujas.

## Publicar un paquete para un cliente

1. Abre `convertidor.html` (en local: `python -m http.server 8000` y entra a `http://localhost:8000/convertidor.html`).
2. Captura el nombre del paquete, agrega uno o varios modelos (`.e2k` + tabla) y genera la contraseña.
3. Se descarga `<identificador>.enc.json`. Cópialo a `models/` y súbelo por pull request.
4. El enlace es `https://<usuario>.github.io/<repositorio>/?c=<identificador>`.
5. En Google Sites: `Insertar → Incrustar → Por URL` y pega ese enlace. Comparte la contraseña por otro canal.

**Seguridad.** El repositorio de GitHub Pages gratuito es público. Los modelos se publican solo cifrados (AES-256-GCM, clave derivada con PBKDF2-SHA256, 600 000 iteraciones); sin la contraseña el archivo no se puede leer, aunque alguien conozca el enlace. Una contraseña débil se puede adivinar por fuerza bruta fuera de línea: usa la generada (o una frase larga) y una distinta por cliente. Nunca subas `.e2k`, `.edb`, tablas ni contraseñas al repositorio.

## Desarrollo

- Pruebas: abrir `tests/index.html` desde un servidor local, o `node --test tests/` (Node 20+).
- Dependencia declarada: `three` 0.160.0 (MIT) en `vendor/three.module.min.js`, descargada de jsDelivr.
- Estilo: tokens de ALBA-ds en `design/alba-ds.css`.

## Limitaciones conocidas

- No se consideran offsets de extremos ni zonas rígidas: las longitudes son entre nodos.
- Los ejes se leen de `$ GRIDS` solo para sistemas cartesianos sin rotación; el origen desplazado (XORIGIN/YORIGIN) es un supuesto sin validar.
- La orientación de los contraventos (qué extremo va abajo) es un supuesto pendiente de confirmar contra ETABS.
- Las áreas (losas y muros) siguen la sintaxis supuesta del `.e2k`: pendiente de validar con un modelo que las incluya. Muros solo rectangulares; losas tipo deck sin volumen.
- Secciones no soportadas (ángulos, T, personalizadas) se dibujan como rectángulo envolvente; sus cantidades salen de la tabla si el área viene ahí.
