import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { todayLocalISO, dateToLocalISO, parseLocalDateISO } from './dateHelpers';

describe('dateHelpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('dateToLocalISO', () => {
    it('formats a Date in local timezone', () => {
      // 2026-05-25 03:00 local — regardless of TZ, output is "2026-05-25"
      const d = new Date(2026, 4, 25, 3, 0, 0);
      expect(dateToLocalISO(d)).toBe('2026-05-25');
    });

    it('pads single-digit months and days', () => {
      expect(dateToLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
  });

  describe('todayLocalISO', () => {
    it('returns today in local timezone — not UTC', () => {
      // Simula 2026-05-25 02:00 hora Chile (UTC-4) = 2026-05-25 06:00 UTC.
      // Aquí no hay drift, ambas zonas dan el mismo día.
      vi.setSystemTime(new Date(2026, 4, 25, 2, 0, 0));
      expect(todayLocalISO()).toBe('2026-05-25');
    });

    it('does not regress to previous day even when UTC has already advanced', () => {
      // Simula 2026-05-25 21:00 local — la fecha local sigue siendo el 25.
      // `new Date().toISOString().slice(0,10)` daría '2026-05-26' en UTC+3
      // o '2026-05-25' en UTC-3 — todayLocalISO siempre devuelve la local.
      vi.setSystemTime(new Date(2026, 4, 25, 21, 0, 0));
      expect(todayLocalISO()).toBe('2026-05-25');
    });
  });

  describe('parseLocalDateISO', () => {
    it('parses YYYY-MM-DD as local midnight (not UTC)', () => {
      const d = parseLocalDateISO('2026-05-25');
      // getDate/Month/FullYear son siempre los del string, sin importar el TZ
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(4);
      expect(d.getDate()).toBe(25);
      expect(d.getHours()).toBe(0);
    });

    it('round-trip: dateToLocalISO(parseLocalDateISO(x)) === x', () => {
      expect(dateToLocalISO(parseLocalDateISO('2026-05-25'))).toBe('2026-05-25');
      expect(dateToLocalISO(parseLocalDateISO('2026-01-01'))).toBe('2026-01-01');
      expect(dateToLocalISO(parseLocalDateISO('2026-12-31'))).toBe('2026-12-31');
    });
  });
});
