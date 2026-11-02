# Visor de modelos ETABS

## Tipo de proyecto

HTML autocontenido / sitio estático (JavaScript ES modules, sin build) publicado en GitHub Pages e incrustado en Google Sites por URL. Se eligió sitio estático porque el visor no necesita servidor y los modelos van cifrados en el repositorio.

## Comandos

- Instalar dependencias: ninguna (three.js se versiona en `vendor/`).
- Ejecutar: `python -m http.server 8000` en la raíz y abrir `http://localhost:8000/` (los módulos ES no cargan desde `file://`).
- Pruebas: `node --test tests/` (requiere Node.js 20+, sin dependencias).
- Lint/formato: no aplica por ahora.
- Build: no hay.

## Verificaciones automáticas

Ver `.claude/harness.json`.

## Flujo obligatorio

Ver el proceso del equipo (`/plan`, `/implementar`, `/revisar`, `/pr`). Ramas `<tipo>/<n°-issue>-<descripcion>`; commits en español con Conventional Commits.

## Reglas de ingeniería

- Unidades explícitas en nombres (`longitud_m`, `volumen_m3`, `peso_kg`). Todas las conversiones viven en `src/core/unidades.js`.
- Los valores esperados de las pruebas salen de cálculo manual o de ETABS, nunca del propio código.
- La lógica (parser, cantidades, cifrado) está en `src/core/` sin acceso al DOM; la interfaz está en `src/visor/` y en los `.html`.

## Estructura

- `index.html` — visor (acceso con contraseña + vista 3D + panel de selección).
- `convertidor.html` — herramienta interna: lee `.e2k`, calcula cantidades y genera el modelo cifrado.
- `src/core/` — `unidades.js`, `e2k.js`, `tabla.js`, `modelo.js`, `resumen.js`, `cripto.js`, `paquete.js`.
- `src/visor/`, `src/convertidor/` — interfaz (DOM y three.js).
- `models/` — `<id>.enc.json`: un paquete cifrado (AES-GCM) por cliente; el id va en la URL (`?c=<id>`). No hay índice público.
- `design/` — tokens ALBA-ds (copia de la plantilla web del plugin).

## Seguridad de los modelos

- GitHub Pages gratuito exige repo público: los modelos se publican **solo cifrados** (AES-256-GCM, clave derivada con PBKDF2 de la contraseña). Nunca se versiona un modelo sin cifrar ni una contraseña.
- Los `.e2k`, `.edb` y `.xlsx` originales no se commitean (ver `.gitignore`).

## Prohibido

Lo del proceso del equipo: push a `main`, `--force`, credenciales o datos de clientes en el repo, binarios de ETABS, dependencias sin declarar.

## Particularidades

- Formato `.e2k`: validado con un archivo de ETABS 23.3.2 solo en frames (ELEV, un LINEASSIGN por piso, secciones de catálogo sin dimensiones). Las ÁREAS (`AREA CONNECTIVITIES`, muros, losas) siguen siendo supuestas hasta probar un modelo que las incluya.
- El área de sección del acero de catálogo viene de la tabla "Frame Section Properties" exportada de ETABS; sin ella no hay peso.
- Los archivos de la carpeta `docs/` (modelos de ejemplo) no se versionan.
- Sin Node local: las pruebas se corren en `tests/index.html` (navegador); `node --test tests/` corre en CI.
- El peso de acero se calcula como área de sección × longitud × peso volumétrico del material del propio modelo.
