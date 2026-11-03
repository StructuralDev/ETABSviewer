# Visor de modelos ETABS

Visor 3D para compartir modelos de ETABS con clientes mediante un enlace (incrustable en Google Sites).
Al seleccionar uno o varios elementos muestra su geometría y sus cantidades: **peso** si es acero, **volumen** si es concreto.

- **Visor** (`index.html`): el cliente abre el enlace, escribe la contraseña y ve los modelos.
- **Convertidor** (`convertidor.html`): herramienta interna que lee los archivos de ETABS y genera el paquete **cifrado** que se publica.

## Qué se exporta desde ETABS

1. **`.e2k`** de cada modelo: `File → Export → ETABS .e2k File`. Trae geometría, pisos, materiales y espesores.
2. **Biblioteca de perfiles** (solo para el peso del acero de perfiles de catálogo): el `.e2k` trae el nombre del perfil (p. ej. `HSS8X8X1/4`) y el archivo (`FILE "AISC14"`), pero no su área. El área está en la carpeta `Property Libraries` de tu instalación de ETABS (p. ej. `C:\Program Files\Computers and Structures\ETABS 23\Property Libraries\AISC14.xml`). En el convertidor eliges **una vez** esa carpeta: solo se leen los archivos que el modelo necesita y quedan guardados en tu navegador (no se suben a ningún lado). Es la misma biblioteca que usa ETABS, así que no hace falta exportar tablas de Excel. **Las bibliotecas son de CSI y no se incluyen en este repositorio.**
3. **Tabla `Frame Section Properties`** (opcional): solo para perfiles que no estén en las bibliotecas (secciones propias, otras normas). `Display → Show Tables → Model Definition → Section Properties → Frame Section Properties`, y luego `File → Export → Excel`. El `.xlsx` se carga tal cual (también sirve CSV). ETABS redondea el área a los decimales de la tabla (p. ej. 0.1 cm²): la biblioteca es más exacta.

Orden de prioridad del área: dimensiones del propio `.e2k` → biblioteca → tabla.

Unidades de salida: m, m², m³, kg (se convierten desde las unidades del archivo).

## Controles

| Acción | Cómo |
|---|---|
| Ver qué elemento tocas | Pasar el cursor: el elemento se aclara un poco (no hay hover en pantalla táctil ni mientras arrastras) |
| Seleccionar un elemento | Clic (un clic en vacío no cambia la selección) |
| Caja **izquierda → derecha** (azul, continua) | Selecciona solo lo que queda **completamente** dentro, como en CAD |
| Caja **derecha → izquierda** (verde, punteada) | Selecciona todo lo que la **toque**, aunque sea en parte |
| Sumar o quitar de la selección | Ctrl, Cmd o Mayús + clic o caja |
| Quitar la selección | Tecla **Esc** |
| Zoom | Rueda |
| Desplazar (pan) | Arrastrar con la rueda (botón central); también botón derecho |
| Girar | Mayús + arrastrar con la rueda; en pantalla táctil, dos dedos |
| Ancho del panel | Arrastrar el divisor entre la vista y el panel |

**Tabla de elementos seleccionados.** Con dos o más elementos, el panel lista cada uno y deja siempre visible una fila de **Total** (n.º de elementos, peso de acero, volumen de todos los materiales, longitud y área). El selector sobre la tabla agrupa con **subtotales** por acero/concreto, tipo de elemento, sección, material de ETABS o piso; los subtotales suman exactamente el total. "Copiar tabla" copia lo que se ve, con el total, listo para pegar en Excel.

**Varios modelos.** Si el paquete trae más de un modelo, aparecen **pestañas** bajo la barra superior. Un enlace puede abrir uno directamente con `&m=<n>` (0 es el primero; p. ej. `?c=<id>&m=1`). Cada cliente es un paquete distinto (otro enlace y otra contraseña).

**Color por** (barra superior): acero / concreto (por omisión), tipo de elemento, sección, material de ETABS o piso. La leyenda aparece abajo a la izquierda de la vista y la selección se resalta siempre en naranja. Quien prepara el paquete puede fijar el color inicial de cada modelo, colores propios, etiquetas para pisos y ejes y notas para el cliente (ver el gestor, más abajo).

**Vistas** (barra superior): `3D`; `Planta` (elige un piso: muestra los objetos asignados a ese piso, vista cenital con el norte, +Y, arriba); `Alzado` (elige un eje de la cuadrícula de ETABS: muestra los objetos contenidos en su plano, mirando desde −Y para ejes numéricos y desde +X para ejes con letra). Planta y alzado usan cámara ortográfica y dibujan los ejes con sus burbujas.

Despliegue y seguridad: ver [DESPLIEGUE.md](DESPLIEGUE.md).

## Publicar un paquete para un cliente

1. Abre `convertidor.html` (en local: `python -m http.server 8000 --bind 127.0.0.1` y entra a `http://localhost:8000/convertidor.html`).
2. Elige la carpeta `Property Libraries` de tu ETABS (una vez), captura el nombre del paquete, agrega uno o varios modelos (`.e2k`, y tabla solo si hace falta) y genera la contraseña.
3. Se descarga `<identificador>.enc.json`. Cópialo a `models/` y súbelo por pull request.
4. El enlace es `https://structuraldev.github.io/ETABSviewer/?c=<identificador>`.
5. En Google Sites: `Insertar → Incrustar → Por URL` y pega ese enlace. Comparte la contraseña por otro canal.

### Gestor: editar un paquete ya publicado

En el mismo convertidor, el bloque **Abrir un paquete existente** recibe el `models/<id>.enc.json` y su contraseña. Desde ahí puedes, sin volver a los `.e2k` originales:

- renombrar el paquete y cada modelo, **reordenar** (↑ ↓), **quitar** (se pide confirmar con una segunda pulsación) y **agregar** modelos nuevos desde un `.e2k` (van al final);
- por modelo, en *Presentación para el cliente*: **nota** (se ve en el panel cuando no hay selección), **color inicial** (por tipo, sección, material, piso o acero/concreto), **colores propios** por categoría y **etiquetas** para pisos y ejes (solo cambian el texto mostrado; geometría y elevaciones no se tocan; las de ejes admiten hasta 6 caracteres);
- una **nota general** del paquete.

Al abrir, el identificador y la contraseña se conservan: si generas con ambos iguales y reemplazas el archivo en `models/`, el enlace del cliente sigue funcionando. Con **Nuevo** (identificador) o **Generar** (contraseña) el enlace o la clave anteriores dejan de servir para esta versión; la versión previa queda en el historial de git, así que para retirar un acceso hay que crear un paquete nuevo. Los paquetes anteriores a esta función se abren igual: la presentación es opcional.

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
