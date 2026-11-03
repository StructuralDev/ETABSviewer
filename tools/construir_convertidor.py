#!/usr/bin/env python3
"""Arma `dist/convertidor-autonomo.html`: el convertidor en un solo archivo HTML.

El archivo se abre con doble clic (sin servidor ni internet) y se puede mandar por correo o Teams.
Para ello se juntan en él el HTML, el CSS, el logo y todos los módulos JavaScript del convertidor:

  * Los módulos viajan como URL `data:` dentro de un mapa de importación (importmap); las rutas
    relativas (`../core/paquete.js`) se reescriben a nombres (`mod/core/paquete.js`).
  * Una política de contenido (CSP) con hashes deja ejecutar solo ese código y bloquea toda conexión
    de red (`connect-src 'none'`): los .e2k no pueden salir de la computadora.

No usa dependencias fuera de la biblioteca estándar de Python. El archivo generado no se versiona.
"""
import argparse
import base64
import datetime
import hashlib
import json
import pathlib
import posixpath
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SRC = RAIZ / 'src'
ENTRADA = 'convertidor/principal.js'  # relativo a src/
SALIDA_POR_OMISION = RAIZ / 'dist' / 'convertidor-autonomo.html'

# from './x.js'  /  from "../core/x.js"  /  import './x.js'  (solo rutas relativas)
IMPORTACION = re.compile(r"""(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}/[^'"\n]+)\2""")


class ErrorConstruccion(Exception):
    pass


def hash_csp(texto: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(texto.encode('utf-8')).digest()).decode() + "'"


def clave_modulo(ruta_relativa: str) -> str:
    return f'mod/{ruta_relativa}'


def recolectar_modulos() -> dict:
    """Devuelve {clave: código} con todos los módulos que alcanza la entrada, con importaciones reescritas."""
    pendientes = [ENTRADA]
    vistos = {}
    while pendientes:
        ruta = pendientes.pop()
        if ruta in vistos:
            continue
        archivo = SRC / ruta
        if not archivo.is_file():
            raise ErrorConstruccion(f'No existe el módulo importado: src/{ruta}')
        codigo = archivo.read_text(encoding='utf-8-sig')

        def reescribe(m, ruta=ruta):
            destino = posixpath.normpath(posixpath.join(posixpath.dirname(ruta), m.group(3)))
            if destino.startswith('..') or not destino.endswith('.js'):
                raise ErrorConstruccion(f'Importación fuera de src/ o que no es .js en src/{ruta}: {m.group(3)}')
            pendientes.append(destino)
            return f'{m.group(1)}{m.group(2)}{clave_modulo(destino)}{m.group(2)}'

        vistos[ruta] = IMPORTACION.sub(reescribe, codigo)
    return {clave_modulo(r): c for r, c in vistos.items()}


def version_del_repo() -> str:
    def git(*args):
        return subprocess.run(['git', *args], cwd=RAIZ, capture_output=True, text=True, check=True).stdout.strip()
    try:
        corto = git('rev-parse', '--short', 'HEAD')
        sucio = '+cambios sin guardar' if git('status', '--porcelain', '--', 'src', 'convertidor.html', 'design', 'tools') else ''
    except (OSError, subprocess.CalledProcessError):
        corto, sucio = 'sin-git', ''
    return f'Versión {corto}{sucio} · {datetime.date.today().isoformat()}'


def sustituir(texto: str, viejo: str, nuevo: str) -> str:
    if texto.count(viejo) != 1:
        raise ErrorConstruccion(f'La plantilla convertidor.html debe contener exactamente una vez: {viejo[:70]!r}')
    return texto.replace(viejo, nuevo)


def construir(version=None):
    modulos = recolectar_modulos()
    for clave, codigo in modulos.items():
        if re.search(r'\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon', codigo):
            raise ErrorConstruccion(f'{clave} hace peticiones de red; el convertidor autónomo no puede.')

    mapa = {clave: 'data:text/javascript;base64,' + base64.b64encode(codigo.encode('utf-8')).decode()
            for clave, codigo in sorted(modulos.items())}
    importmap = json.dumps({'imports': mapa}, separators=(',', ':'))
    arranque = f"import '{clave_modulo(ENTRADA)}';"

    css_base = (RAIZ / 'design' / 'alba-ds.css').read_text(encoding='utf-8-sig')
    css_visor = (RAIZ / 'src' / 'visor' / 'estilo.css').read_text(encoding='utf-8-sig')
    css_visor = sustituir(css_visor, "@import url('../../design/alba-ds.css');", '')
    css = css_base + '\n' + css_visor

    logo = 'data:image/svg+xml;base64,' + base64.b64encode((RAIZ / 'design' / 'logo_alba.svg').read_bytes()).decode()

    csp = ("default-src 'none'; "
           f"script-src {hash_csp(importmap)} {hash_csp(arranque)} data:; "
           f"style-src {hash_csp(css)}; "
           "img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'")

    html = (RAIZ / 'convertidor.html').read_text(encoding='utf-8-sig')
    html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', f'<meta http-equiv="Content-Security-Policy" content="{csp}">', html, count=1)
    html = sustituir(html, '<link rel="stylesheet" href="src/visor/estilo.css">', f'<style>{css}</style>')
    html = sustituir(html, 'src="design/logo_alba.svg"', f'src="{logo}"')
    html = sustituir(html, '<script type="module" src="src/convertidor/principal.js"></script>',
                     f'<script type="importmap">{importmap}</script>\n  <script type="module">{arranque}</script>')
    html = sustituir(html, '<!--VERSION-->', version or version_del_repo())
    return html


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('-o', '--salida', type=pathlib.Path, default=SALIDA_POR_OMISION)
    args = ap.parse_args(argv)
    try:
        html = construir()
    except ErrorConstruccion as e:
        print(f'Error: {e}', file=sys.stderr)
        return 1
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    # Saltos de línea LF siempre: los hashes de la política de contenido se calcularon sobre ese texto.
    with open(args.salida, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print(f'Listo: {args.salida} ({len(html.encode("utf-8")) / 1024:.0f} KB)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
