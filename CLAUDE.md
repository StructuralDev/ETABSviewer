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
- `src/core/` — `unidades.js`, `e2k.js`, `modelo.js`, `cripto.js`.
- `models/` — `models.json` (índice público) y `*.enc.json` (modelos cifrados AES-GCM).
- `design/` — tokens ALBA-ds (copia de la plantilla web del plugin).

## Seguridad de los modelos

- GitHub Pages gratuito exige repo público: los modelos se publican **solo cifrados** (AES-256-GCM, clave derivada con PBKDF2 de la contraseña). Nunca se versiona un modelo sin cifrar ni una contraseña.
- Los `.e2k`, `.edb` y `.xlsx` originales no se commitean (ver `.gitignore`).

## Prohibido

Lo del proceso del equipo: push a `main`, `--force`, credenciales o datos de clientes en el repo, binarios de ETABS, dependencias sin declarar.

## Particularidades

- Formato `.e2k`: las suposiciones sobre su sintaxis deben validarse contra un archivo real exportado de ETABS (v22/v23) antes de dar por buenas las cantidades.
- El peso de acero se calcula como área de sección × longitud × peso volumétrico del material del propio modelo.
