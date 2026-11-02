// Lector de .xlsx y tabla de secciones de ETABS. El libro de prueba se arma con la misma
// estructura que escribe ETABS/Excel (cadenas compartidas, celdas con r="B3", fila de unidades).
// Valores esperados: los de la tabla "Frame Prop - Summary" real de la torre de ejemplo
// (HSS8X8X1/4 = 45.8 cm², HSS3X3X1/8 = 8.4 cm²), convertidos a mano: 1 cm² = 1e-4 m².
import { prueba, cerca, igual, lanza } from './lib.js';
import { leerXlsx } from '../src/core/xlsx.js';
import { parsearTablaDeHojas } from '../src/core/tabla.js';

const enc = new TextEncoder();

async function deflateRaw(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Zip mínimo (sin CRC: el lector no lo verifica). comprimir=true usa deflate (método 8).
async function armarZip(archivos, comprimir) {
  const partes = [], central = [];
  let pos = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const n = enc.encode(nombre);
    const crudo = enc.encode(texto);
    const datos = comprimir ? await deflateRaw(crudo) : crudo;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, comprimir ? 8 : 0, true);
    lh.setUint32(18, datos.length, true);
    lh.setUint32(22, crudo.length, true);
    lh.setUint16(26, n.length, true);
    partes.push(new Uint8Array(lh.buffer), n, datos);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, comprimir ? 8 : 0, true);
    ch.setUint32(20, datos.length, true);
    ch.setUint32(24, crudo.length, true);
    ch.setUint16(28, n.length, true);
    ch.setUint32(42, pos, true);
    central.push(new Uint8Array(ch.buffer), n);
    pos += 30 + n.length + datos.length;
  }
  const tamCentral = central.reduce((s, a) => s + a.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, Object.keys(archivos).length, true);
  fin.setUint16(10, Object.keys(archivos).length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, pos, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of todo) { out.set(a, o); o += a.length; }
  return out.buffer;
}

const libro = {
  'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Program Control" sheetId="1" r:id="rId1"/><sheet name="Frame Prop - Summary" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>TABLE:  Program Control</t></si><si><t>Name</t></si><si><t>Material</t></si><si><t>Shape</t></si><si><t>Area</t></si>'
    + '<si><t>cm²</t></si><si><t>HSS8X8X1/4</t></si><si><t>A500GrB46</t></si><si><t>Steel Tube</t></si><si><t>HSS3X3X1/8</t></si><si><r><t>Mat &amp; </t></r><r><t>Nota</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml': '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c><c r="E2" t="s"><v>4</v></c></row>'
    + '<row r="3"><c r="E3" t="s"><v>5</v></c></row>'
    + '<row r="4"><c r="A4" t="s"><v>6</v></c><c r="B4" t="s"><v>7</v></c><c r="C4" t="s"><v>8</v></c><c r="E4"><v>45.8</v></c></row>'
    + '<row r="5"><c r="A5" t="s"><v>9</v></c><c r="B5" t="s"><v>7</v></c><c r="C5" t="s"><v>8</v></c><c r="E5"><v>8.4</v></c></row>'
    + '</sheetData></worksheet>',
};

for (const comprimir of [false, true]) {
  const etiqueta = comprimir ? 'deflate' : 'sin comprimir';

  await prueba(`xlsx (${etiqueta}): hojas, celdas dispersas y cadenas compartidas`, async () => {
    const hojas = await leerXlsx(await armarZip(libro, comprimir));
    igual(hojas.map((h) => h.nombre), ['Program Control', 'Frame Prop - Summary']);
    const f = hojas[1].filas;
    igual(f[1], ['Name', 'Material', 'Shape', '', 'Area']); // la columna D vacía conserva su lugar
    igual(f[2], ['', '', '', '', 'cm²']);
    igual(f[3][4], '45.8');
  });

  await prueba(`tabla de secciones desde Excel (${etiqueta}): área en cm² -> m²`, async () => {
    const hojas = await leerXlsx(await armarZip(libro, comprimir));
    const t = parsearTablaDeHojas(hojas);
    cerca(t['HSS8X8X1/4'].area_m2, 0.00458, 1e-12); // 45.8 cm² × 1e-4
    cerca(t['HSS3X3X1/8'].area_m2, 0.00084, 1e-12); // 8.4 cm² × 1e-4
    igual(t['HSS8X8X1/4'].forma, 'Steel Tube');
    igual(t['HSS8X8X1/4'].D, null); // la tabla Summary no trae dimensiones
  });
}

await prueba('xlsx: errores claros', async () => {
  await lanza(() => leerXlsx(new ArrayBuffer(10)), /no es un \.xlsx/);
  const sinTabla = await leerXlsx(await armarZip({ ...libro, 'xl/worksheets/sheet2.xml': libro['xl/worksheets/sheet1.xml'] }, false));
  await lanza(() => parsearTablaDeHojas(sinTabla), /Ninguna hoja/);
});

await prueba('entidades XML y texto con formato se decodifican', async () => {
  const hojas = await leerXlsx(await armarZip({
    ...libro,
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>10</v></c></row></sheetData></worksheet>',
  }, false));
  igual(hojas[0].filas[0][0], 'Mat & Nota');
});

await prueba('xlsx: offsets del zip fuera del archivo se rechazan con un mensaje claro', async () => {
  const buf = await armarZip(libro, false);
  const v = new DataView(buf);
  // El desplazamiento de la primera entrada (directorio central) apunta mucho más allá del archivo
  const fin = buf.byteLength - 22;
  const inicioCentral = v.getUint32(fin + 16, true);
  v.setUint32(inicioCentral + 42, 0x7fffffff, true);
  await lanza(() => leerXlsx(buf), /fuera del archivo/);
});
