# Despliegue

## Qué se publica y dónde

- **Sitio:** GitHub Pages del repositorio, publicado por `.github/workflows/pages.yml` en cada merge a `main`.
  Solo se sube `index.html`, `src/` (sin el convertidor), `design/`, `vendor/` y `models/`.
- **Modelos:** únicamente cifrados (`models/<id>.enc.json`, AES-256-GCM). Los `.e2k`, `.edb`, tablas y contraseñas **no** van al repositorio.
- **Enlace para el cliente:** `https://<org>.github.io/<repo>/?c=<id>` (opcional `&m=<n>` para abrir un modelo concreto).
- **Google Sites:** `Insertar → Incrustar → Por URL`, pegar el enlace. GitHub Pages no bloquea la inserción en un iframe.
- **Convertidor:** herramienta interna; se usa en local (`python -m http.server 8000` → `http://localhost:8000/convertidor.html`).

## Límite que hay que tener claro

GitHub Pages **siempre es público**, aun con repositorio privado (el control de acceso por organización solo existe en Enterprise Cloud,
y la organización ALBA-Desarrollos está en el plan *free*, que además exige repositorio público para Pages).
Por eso la protección es el cifrado, no el acceso al sitio:

- Quien tenga el enlace pero no la contraseña solo ve la pantalla de acceso.
- Quien descargue `models/<id>.enc.json` puede intentar adivinar la contraseña fuera de línea. Con la contraseña generada por el convertidor (16 caracteres al azar) y 600 000 iteraciones de PBKDF2 no es práctico; **una contraseña corta o de diccionario sí se rompe**.
- El nombre del cliente y del proyecto viajan dentro del paquete cifrado; el identificador del enlace es aleatorio.
- Un paquete publicado no se puede "despublicar" del historial de git ni de cachés: quien tuvo la contraseña conserva acceso a esa versión. Para retirar a alguien, genera un paquete **nuevo** (otro identificador y otra contraseña) y borra el anterior.

## Puesta en marcha (una sola vez)

1. Crear el issue del proyecto y el repositorio (`ALBA-Desarrollos/visor-etabs`, público).
2. Subir la rama `feat/visor-etabs`, abrir el PR con `/pr` y que una persona lo apruebe y haga el merge a `main`.
3. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Proteger `main` (Settings → Branches): PR obligatorio con 1 aprobación y el CI en verde.
5. Tras el primer merge, el flujo "Publicar visor" deja la URL en el resumen del job; probar con un paquete de prueba.

## Publicar o actualizar un cliente

1. Convertidor local → descarga `<id>.enc.json` y muestra la contraseña.
2. Copiar a `models/` y abrir un PR (el CI revisa que no haya secretos ni binarios).
3. Merge → el flujo publica en ~1-2 minutos (la caché de Pages puede tardar unos minutos más).
4. Enviar al cliente el enlace y, **por otro canal**, la contraseña.

## Seguridad aplicada en el sitio

- Política de contenido (CSP) en `index.html`: solo scripts propios y el mapa de importación con hash; sin estilos ni scripts en línea; sin peticiones a terceros.
- `noindex` y `referrer: no-referrer`.
- Sin dependencias en tiempo de ejecución fuera de `vendor/three.module.min.js` (versionado, 0.160.0).
- Las acciones de GitHub usadas son las oficiales (`actions/*`), fijadas por versión mayor.
