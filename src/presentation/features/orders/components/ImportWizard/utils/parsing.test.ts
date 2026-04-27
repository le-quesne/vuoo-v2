import { describe, it, expect } from 'vitest';
import { parseCsv, parseFile, ParseError, cellToString } from './parsing';

function makeFile(content: string | ArrayBuffer, name: string, type = 'text/csv'): File {
  return new File([content], name, { type });
}

function makeBomBuffer(text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const body = encoder.encode(text);
  const out = new Uint8Array(bom.length + body.length);
  out.set(bom, 0);
  out.set(body, bom.length);
  return out.buffer;
}

function makeWindows1252Buffer(text: string): ArrayBuffer {
  // Mapa simple de los caracteres latinos comunes a sus bytes Windows-1252.
  const map: Record<string, number> = {
    á: 0xe1, é: 0xe9, í: 0xed, ó: 0xf3, ú: 0xfa,
    Á: 0xc1, É: 0xc9, Í: 0xcd, Ó: 0xd3, Ú: 0xda,
    ñ: 0xf1, Ñ: 0xd1, ü: 0xfc, Ü: 0xdc,
  };
  const out: number[] = [];
  for (const ch of text) {
    if (map[ch] !== undefined) out.push(map[ch]);
    else if (ch.charCodeAt(0) < 128) out.push(ch.charCodeAt(0));
    else out.push(0x3f);
  }
  return new Uint8Array(out).buffer;
}

describe('parseCsv', () => {
  it('parsea ASCII puro', async () => {
    const file = makeFile('name,age\nJuan,30\nMaria,25\n', 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual(['name', 'age']);
    expect(r.rows).toEqual([
      { name: 'Juan', age: '30' },
      { name: 'Maria', age: '25' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('strips UTF-8 BOM del primer header', async () => {
    const file = makeFile(makeBomBuffer('name,age\nJuan,30\n'), 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers[0]).toBe('name');
  });

  it('detecta separador `;` (Excel español)', async () => {
    const file = makeFile('name;age;city\nJuan;30;Santiago\n', 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual(['name', 'age', 'city']);
    expect(r.rows[0]).toEqual({ name: 'Juan', age: '30', city: 'Santiago' });
  });

  it('respeta line breaks dentro de quoted fields', async () => {
    const file = makeFile('a,b\n"line\nbreak",second\n', 'a.csv');
    const r = await parseCsv(file);
    expect(r.rows[0]).toEqual({ a: 'line\nbreak', b: 'second' });
  });

  it('renombra headers duplicados y emite warning', async () => {
    const file = makeFile('Direccion,Cliente,Direccion\nA,Juan,B\n', 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual(['Direccion', 'Cliente', 'Direccion (2)']);
    expect(r.rows[0]).toEqual({ Direccion: 'A', Cliente: 'Juan', 'Direccion (2)': 'B' });
    expect(r.warnings.some((w) => w.includes('duplicados'))).toBe(true);
  });

  it('decodifica Windows-1252 cuando UTF-8 produce caracteres reemplazo', async () => {
    const file = makeFile(makeWindows1252Buffer('nombre,direccion\nJosé,Avenida Ñuñoa\n'), 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual(['nombre', 'direccion']);
    expect(r.rows[0]).toEqual({ nombre: 'José', direccion: 'Avenida Ñuñoa' });
  });

  it('rechaza archivos con más de MAX_COLUMNS columnas', async () => {
    const headers = Array.from({ length: 200 }, (_, i) => `c${i}`).join(',');
    const file = makeFile(headers + '\n', 'a.csv');
    await expect(parseCsv(file)).rejects.toThrow(ParseError);
  });

  it('devuelve vacío para archivo sin filas', async () => {
    const file = makeFile('', 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});

describe('cellToString', () => {
  it('null/undefined → ""', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(undefined)).toBe('');
  });
  it('Date midnight UTC → YYYY-MM-DD', () => {
    const d = new Date(Date.UTC(2026, 3, 21, 0, 0, 0));
    expect(cellToString(d)).toBe('2026-04-21');
  });
  it('Date con hora → ISO completo', () => {
    const d = new Date(Date.UTC(2026, 3, 21, 14, 30, 0));
    expect(cellToString(d)).toBe('2026-04-21T14:30:00.000Z');
  });
  it('Date inválida → ""', () => {
    expect(cellToString(new Date('invalid'))).toBe('');
  });
  it('number → string', () => {
    expect(cellToString(601)).toBe('601');
  });
  it('boolean → string', () => {
    expect(cellToString(true)).toBe('true');
  });
  it('string → trim', () => {
    expect(cellToString('  hola  ')).toBe('hola');
  });
});

describe('Date cells (XLSX) → ISO 8601', () => {
  // No tenemos un fixture XLSX en tests, pero exponemos la lógica via parseCsv:
  // si el shape del CSV trae una fecha al estilo "Mon Apr 21 2026", debería
  // dejarla tal cual (es un string). El bug ocurre solo con read-excel-file
  // devolviendo Date objects. Acá probamos que nuestro CSV path no rompe
  // strings que parecen fechas.
  it('preserva string ISO en CSV', async () => {
    const csv = 'fecha,cliente\n2026-04-21,Juan\n';
    const file = makeFile(csv, 'a.csv');
    const r = await parseCsv(file);
    expect(r.rows[0].fecha).toBe('2026-04-21');
  });
});

describe('parseFile', () => {
  it('rutea a parseCsv para .csv', async () => {
    const file = makeFile('a,b\n1,2\n', 'sample.csv');
    const r = await parseFile(file);
    expect(r.headers).toEqual(['a', 'b']);
  });
});

describe('parseCsv — header row detection y trimming', () => {
  it('detecta fila de header cuando la primera tiene un solo título', async () => {
    const csv = 'FACTURACION MES MARZO\nCliente,Direccion,Telefono\nJuan,Av 1,123\n';
    const file = makeFile(csv, 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual(['Cliente', 'Direccion', 'Telefono']);
    expect(r.rows[0]).toEqual({ Cliente: 'Juan', Direccion: 'Av 1', Telefono: '123' });
    expect(r.warnings.some((w) => w.toLowerCase().includes('header'))).toBe(true);
  });

  it('drop columnas trailing sin datos', async () => {
    // 5 columnas de header pero solo las primeras 2 tienen datos en filas posteriores
    const csv = 'Cliente,Direccion,,,\nJuan,Av 1,,,\n';
    const file = makeFile(csv, 'a.csv');
    const r = await parseCsv(file);
    expect(r.headers).toEqual(['Cliente', 'Direccion']);
    expect(r.rows[0]).toEqual({ Cliente: 'Juan', Direccion: 'Av 1' });
  });

  it('drop filas completamente vacías', async () => {
    const csv = 'a,b\n1,2\n,\n3,4\n';
    const file = makeFile(csv, 'a.csv');
    const r = await parseCsv(file);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ a: '1', b: '2' });
    expect(r.rows[1]).toEqual({ a: '3', b: '4' });
  });
});
