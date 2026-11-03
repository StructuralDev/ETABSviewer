"""Pruebas del empaquetador del convertidor autónomo. Se corren con:
    python -m unittest discover -s tools -p "test_*.py" -v
Comprueban que el HTML generado es realmente autónomo (sin recursos externos ni red), que los hashes
de la política de contenido coinciden con lo que se incrusta y que todos los módulos quedan resueltos.
"""
import base64
import hashlib
import json
import pathlib
import re
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import construir_convertidor as c  # noqa: E402


def sha256_csp(texto):
    return "'sha256-" + base64.b64encode(hashlib.sha256(texto.encode('utf-8')).digest()).decode() + "'"


class PruebasConstruccion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = c.construir('Versión de prueba')
        m = re.search(r'<script type="importmap">(.*?)</script>', cls.html, re.S)
        cls.texto_mapa = m.group(1)
        cls.mapa = json.loads(cls.texto_mapa)['imports']
        cls.codigos = {k: base64.b64decode(v.split(',', 1)[1]).decode('utf-8') for k, v in cls.mapa.items()}
        cls.csp = re.search(r'Content-Security-Policy" content="([^"]*)"', cls.html).group(1)

    def test_sin_recursos_externos(self):
        self.assertNotIn('<link', self.html)
        for destino in re.findall(r'(?:src|href)="([^"]*)"', self.html):
            self.assertTrue(destino.startswith('data:'), f'recurso externo: {destino[:60]}')

    def test_hashes_de_la_politica_coinciden_con_lo_incrustado(self):
        arranque = re.search(r'<script type="module">(.*?)</script>', self.html, re.S).group(1)
        estilo = re.search(r'<style>(.*?)</style>', self.html, re.S).group(1)
        for texto in (self.texto_mapa, arranque, estilo):
            self.assertIn(sha256_csp(texto), self.csp)

    def test_estilos_completos_y_sin_bom(self):
        """Un BOM al inicio del CSS (alba-ds.css lo trae) hace que el navegador descarte el bloque :root con los colores."""
        estilo = re.search(r'<style>(.*?)</style>', self.html, re.S).group(1)
        self.assertNotIn('﻿', self.html)
        self.assertTrue(estilo.lstrip().startswith('/*'))
        for token in ('--alba-neutral-0:', '--alba-primary-300:', '--bg:', '--text:', '--font:'):
            self.assertIn(token, estilo, f'falta {token} en los estilos incrustados')
        self.assertNotIn('@import', estilo)

    def test_politica_bloquea_la_red(self):
        for directiva in ("default-src 'none'", "connect-src 'none'", "base-uri 'none'", "form-action 'none'"):
            self.assertIn(directiva, self.csp)
        self.assertNotIn("'unsafe-inline'", self.csp)
        self.assertNotIn("'unsafe-eval'", self.csp)

    def test_modulos_sin_rutas_relativas_y_todos_resueltos(self):
        self.assertIn('mod/convertidor/principal.js', self.mapa)
        for clave, codigo in self.codigos.items():
            self.assertIsNone(c.IMPORTACION.search(codigo), f'ruta relativa sin reescribir en {clave}')
            for destino in re.findall(r"""(?:from|import)\s*['"](mod/[^'"]+)['"]""", codigo):
                self.assertIn(destino, self.mapa, f'{clave} importa {destino}, que no está en el mapa')

    def test_no_arrastra_el_visor_ni_three(self):
        self.assertFalse([k for k in self.mapa if k.startswith('mod/visor')])
        self.assertNotIn('three', self.html.lower().replace('three.js', ''))

    def test_ningun_modulo_usa_la_red(self):
        for clave, codigo in self.codigos.items():
            self.assertIsNone(re.search(r'\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon', codigo), clave)

    def test_version_incrustada_y_sin_marcador(self):
        self.assertIn('Versión de prueba', self.html)
        self.assertNotIn('<!--VERSION-->', self.html)

    def test_un_modulo_inexistente_falla_con_mensaje_claro(self):
        original = c.ENTRADA
        c.ENTRADA = 'convertidor/no_existe.js'
        try:
            with self.assertRaisesRegex(c.ErrorConstruccion, 'No existe el módulo'):
                c.recolectar_modulos()
        finally:
            c.ENTRADA = original


if __name__ == '__main__':
    unittest.main()
