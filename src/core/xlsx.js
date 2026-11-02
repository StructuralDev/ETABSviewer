// Lector mínimo de .xlsx (zip + XML) sin dependencias, para las tablas que exporta ETABS.
// Devuelve las hojas como matrices de texto. Usa DecompressionStream('deflate-raw')
// (navegadores actuales y Node 18+). Sin acceso al DOM: el XML se lee con expresiones regulares.

export class ErrorXlsx extends Error {}

const dec = new TextDecoder();

async function inflarRaw(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Lee el directorio central del zip y devuelve { nombre -> () => Promise<Uint8Array> }.
function leerZip(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new ErrorXlsx('El archivo no es un .xlsx válido (no se encontró el directorio del zip).');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const entradas = {};
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new ErrorXlsx('Directorio del zip dañado.');
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const nLong = v.getUint16(p + 28, true), nExtra = v.getUint16(p + 30, true), nCom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + nLong));
    entradas[nombre] = async () => {
      const lN = v.getUint16(local + 26, true), lE = v.getUint16(local + 28, true);
      const datos = b.subarray(local + 30 + lN + lE, local + 30 + lN + lE + tamComp);
      if (metodo === 0) return datos;
      if (metodo === 8) return inflarRaw(datos);
      throw new ErrorXlsx(`Método de compresión no soportado (${metodo}).`);
    };
    p += 46 + nLong + nExtra + nCom;
  }
  return entradas;
}

const entidades = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const textoDe = (xml) => entidades([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

// "AB12" -> índice de columna base 0 (A=0, Z=25, AA=26)
const columnaDe = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * @param {ArrayBuffer} buffer contenido del .xlsx
 * @returns {Promise<Array<{nombre:string, filas:string[][]}>>}
 */
export async function leerXlsx(buffer) {
  const zip = leerZip(buffer);
  const leer = async (n) => {
    if (!zip[n]) throw new ErrorXlsx(`Falta "${n}" dentro del .xlsx.`);
    return dec.decode(await zip[n]());
  };
  const libro = await leer('xl/workbook.xml');
  const rels = await leer('xl/_rels/workbook.xml.rels');
  const destino = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
    if (id && target) destino[id] = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const compartidas = zip['xl/sharedStrings.xml']
    ? [...(await leer('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]))
    : [];

  const hojas = [];
  for (const m of libro.matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = entidades(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const rid = /\br:id="([^"]*)"/.exec(m[0])?.[1];
    const ruta = destino[rid];
    if (!ruta || !zip[ruta]) continue;
    const xml = await leer(ruta);
    const filas = [];
    for (const f of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila = [];
      for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1];
        const tipo = /\bt="(\w+)"/.exec(c[1])?.[1];
        const inner = c[2] ?? '';
        let valor = '';
        if (tipo === 'inlineStr') valor = textoDe(inner);
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
          valor = tipo === 's' && raw !== '' ? (compartidas[Number(raw)] ?? '') : entidades(raw);
        }
        const col = ref ? columnaDe(ref) : fila.length;
        while (fila.length < col) fila.push('');
        fila[col] = valor;
      }
      filas.push(fila);
    }
    hojas.push({ nombre, filas });
  }
  if (hojas.length === 0) throw new ErrorXlsx('El .xlsx no contiene hojas legibles.');
  return hojas;
}
