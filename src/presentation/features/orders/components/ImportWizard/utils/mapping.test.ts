import { describe, it, expect } from 'vitest';
import {
  toOptionalNumber,
  normalizePriority,
  applyMapping,
  previewRowToImportRow,
  findIntraFileDuplicates,
  aggregateByOrderNumber,
} from './mapping';
import type { PreviewRow, MappingConfig } from '../types/import.types';
import { emptyMapping } from '../types/import.types';

describe('toOptionalNumber', () => {
  it('parsea entero limpio', () => {
    expect(toOptionalNumber('5')).toEqual({ value: 5 });
  });
  it('parsea coma decimal', () => {
    expect(toOptionalNumber('5,5')).toEqual({ value: 5.5 });
  });
  it('strip unidad kg', () => {
    expect(toOptionalNumber('3 kg')).toEqual({ value: 3 });
  });
  it('strip unidad m3', () => {
    expect(toOptionalNumber('10 m3')).toEqual({ value: 10 });
  });
  it('emite warning para texto no numérico', () => {
    const r = toOptionalNumber('abc');
    expect(r.value).toBeUndefined();
    expect(r.warning).toBeDefined();
  });
  it('undefined para empty', () => {
    expect(toOptionalNumber('')).toEqual({ value: undefined });
    expect(toOptionalNumber(undefined)).toEqual({ value: undefined });
  });
});

describe('normalizePriority', () => {
  it('mapea alias en español', () => {
    expect(normalizePriority('alta').value).toBe('high');
    expect(normalizePriority('Urgente').value).toBe('urgent');
    expect(normalizePriority('Baja').value).toBe('low');
  });
  it('preserva valores canónicos', () => {
    expect(normalizePriority('high').value).toBe('high');
    expect(normalizePriority('NORMAL').value).toBe('normal');
  });
  it('emite warning para valor desconocido', () => {
    const r = normalizePriority('p1');
    expect(r.value).toBe('normal');
    expect(r.warning).toContain('p1');
  });
  it('undefined para empty', () => {
    expect(normalizePriority('').value).toBeUndefined();
    expect(normalizePriority(undefined).value).toBeUndefined();
  });
});

describe('applyMapping', () => {
  it('mapea solo columnas con header definido', () => {
    const mapping: MappingConfig = { ...emptyMapping(), customer_name: 'Cliente', address: 'Direccion' };
    const raw = { Cliente: 'Juan', Direccion: 'Av. 123', Otra: 'X' };
    expect(applyMapping(raw, mapping)).toEqual({ customer_name: 'Juan', address: 'Av. 123' });
  });

  it('omite columnas sin header en el rawRow', () => {
    const mapping: MappingConfig = { ...emptyMapping(), customer_name: 'NoExiste' };
    const raw = { Cliente: 'Juan' };
    expect(applyMapping(raw, mapping)).toEqual({});
  });
});

describe('previewRowToImportRow', () => {
  function makeRow(values: PreviewRow['values'], lat = 1, lng = 2): PreviewRow {
    return {
      id: 'r1',
      values,
      raw: {},
      geocodingStatus: 'ok',
      lat,
      lng,
      matchQuality: 'none',
      stopId: null,
      overrideCreateNew: false,
      warnings: [],
    };
  }

  it('arma ImportRow con defaults seguros', () => {
    const r = makeRow({ customer_name: 'Juan', address: 'Av 123' });
    const out = previewRowToImportRow(r);
    expect(out.row.customer_name).toBe('Juan');
    expect(out.row.address).toBe('Av 123');
    expect(out.row.total_weight_kg).toBe(0);
    expect(out.row.priority).toBeUndefined();
    expect(out.warnings).toEqual([]);
  });

  it('strip unidades + escala warnings', () => {
    const r = makeRow({
      customer_name: 'Juan',
      address: 'Av 123',
      total_weight_kg: '5 kg',
      volume_m3: '0,5',
      priority: 'alta',
    });
    const out = previewRowToImportRow(r);
    expect(out.row.total_weight_kg).toBe(5);
    expect(out.row.total_volume_m3).toBe(0.5);
    expect(out.row.priority).toBe('high');
    expect(out.warnings).toEqual([]);
  });

  it('warnings cuando priority es desconocida', () => {
    const r = makeRow({ customer_name: 'Juan', address: 'X', priority: 'p1' });
    const out = previewRowToImportRow(r);
    expect(out.warnings.length).toBe(1);
    expect(out.row.priority).toBe('normal');
  });
});

describe('aggregateByOrderNumber', () => {
  function row(id: string, values: Record<string, string>, warnings: string[] = []) {
    return {
      id,
      values,
      raw: {},
      geocodingStatus: 'ok' as const,
      lat: 0,
      lng: 0,
      matchQuality: 'none' as const,
      stopId: null,
      overrideCreateNew: false,
      warnings,
    };
  }

  it('agrupa filas con mismo order_number sumando peso y volumen', () => {
    const rows = [
      row('1', { order_number: '329592', customer_name: 'PINTURAS', total_weight_kg: '15.14', volume_m3: '0.04' }),
      row('2', { order_number: '329592', customer_name: 'PINTURAS', total_weight_kg: '20', volume_m3: '0.06' }),
      row('3', { order_number: '329592', customer_name: 'PINTURAS', total_weight_kg: '5,5', volume_m3: '' }),
      row('4', { order_number: '329595', customer_name: 'OTRO', total_weight_kg: '10' }),
    ];
    const r = aggregateByOrderNumber(rows);
    expect(r.rows).toHaveLength(2);
    expect(r.groupedOrders).toBe(1);
    expect(r.mergedCount).toBe(2);
    const grouped = r.rows.find((x) => x.values.order_number === '329592')!;
    expect(grouped.values.total_weight_kg).toBe('40.64');
    expect(grouped.values.volume_m3).toBe('0.1');
    expect(grouped.warnings.some((w) => w.includes('Agrupado de 3 líneas'))).toBe(true);
  });

  it('concatena internal_notes con separador', () => {
    const rows = [
      row('1', { order_number: 'X', customer_name: 'A', internal_notes: 'Item A' }),
      row('2', { order_number: 'X', customer_name: 'A', internal_notes: 'Item B' }),
    ];
    const r = aggregateByOrderNumber(rows);
    expect(r.rows[0].values.internal_notes).toBe('Item A · Item B');
  });

  it('mantiene filas sin order_number tal cual', () => {
    const rows = [
      row('1', { order_number: '', customer_name: 'A' }),
      row('2', { order_number: '', customer_name: 'B' }),
      row('3', { order_number: 'X', customer_name: 'C' }),
      row('4', { order_number: 'X', customer_name: 'C' }),
    ];
    const r = aggregateByOrderNumber(rows);
    expect(r.rows).toHaveLength(3);
  });

  it('warning cuando códigos de cliente difieren en el mismo order_number', () => {
    const rows = [
      row('1', { order_number: 'X', customer_name: 'A', customer_code: '111' }),
      row('2', { order_number: 'X', customer_name: 'A', customer_code: '222' }),
    ];
    const r = aggregateByOrderNumber(rows);
    expect(r.rows[0].warnings.some((w) => w.includes('Códigos de cliente distintos'))).toBe(true);
  });
});

describe('findIntraFileDuplicates', () => {
  it('detecta duplicados de order_number', () => {
    const rows: PreviewRow[] = [
      { id: '1', values: { order_number: 'A' }, raw: {}, geocodingStatus: 'ok', lat: null, lng: null, matchQuality: 'none', stopId: null, overrideCreateNew: false, warnings: [] },
      { id: '2', values: { order_number: 'B' }, raw: {}, geocodingStatus: 'ok', lat: null, lng: null, matchQuality: 'none', stopId: null, overrideCreateNew: false, warnings: [] },
      { id: '3', values: { order_number: 'A' }, raw: {}, geocodingStatus: 'ok', lat: null, lng: null, matchQuality: 'none', stopId: null, overrideCreateNew: false, warnings: [] },
    ];
    expect(findIntraFileDuplicates(rows)).toEqual(['A']);
  });

  it('ignora filas sin order_number', () => {
    const rows: PreviewRow[] = [
      { id: '1', values: {}, raw: {}, geocodingStatus: 'ok', lat: null, lng: null, matchQuality: 'none', stopId: null, overrideCreateNew: false, warnings: [] },
      { id: '2', values: { order_number: 'A' }, raw: {}, geocodingStatus: 'ok', lat: null, lng: null, matchQuality: 'none', stopId: null, overrideCreateNew: false, warnings: [] },
    ];
    expect(findIntraFileDuplicates(rows)).toEqual([]);
  });
});
