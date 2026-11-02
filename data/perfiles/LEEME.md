# Bibliotecas de perfiles incluidas

Extracto compacto de las bibliotecas `AISC14`, `AISC15`, `AISC16` (y variantes `M` métricas y `AISC16-A1085`) de la carpeta
`Property Libraries` de CSI ETABS 23.3.2. Cada archivo guarda, por perfil de acero, solo lo necesario para el visor:
forma, **área** y dimensiones básicas (peralte, ancho, espesores), convertidas a metros.
Las propiedades son las de la base de datos de perfiles publicada por AISC; no incluyen propiedades de diseño.

Formato (`v: 1`): `{ nombre, formas: [...], p: { "HSS8X8X1/4": [indiceForma, area_m2, D, B, TF, TW] } }`.

Se generaron con `parsearBibliotecaCsi` + `compactarBiblioteca` (`src/core/biblioteca.js`) a partir de los `.xml` originales,
que no se versionan. Para regenerarlos con otra versión de ETABS, carga el `.xml` en el convertidor y úsalo desde ahí, o repite ese proceso.
