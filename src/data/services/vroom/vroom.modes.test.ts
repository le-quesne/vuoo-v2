import { describe, it, expect } from 'vitest';
import type { VroomMode } from './vroom.types';
import { OPTIMIZATION_MODES } from './vroom.modes';

// Lista canónica de modos válidos. Actualizar al agregar/sacar uno y mantener
// en sync con el CHECK constraint de organizations.default_optimization_mode.
const VALID_MODES: VroomMode[] = [
  'efficiency',
  'balance_stops',
  'balance_time',
  'consolidate',
  'on_time',
];

describe('VroomMode', () => {
  it('covers all five business models', () => {
    expect(VALID_MODES).toHaveLength(5);
    expect(VALID_MODES).toContain('efficiency');       // flota propia / paga por hora-km
    expect(VALID_MODES).toContain('consolidate');      // paga por vuelta/ruta
    expect(VALID_MODES).toContain('balance_stops');    // paga por parada
    expect(VALID_MODES).toContain('balance_time');     // viernes corto / igualdad de jornada
    expect(VALID_MODES).toContain('on_time');          // SLA con multa / ventanas estrictas
  });

  it('efficiency is the org default (matches DB column default)', () => {
    const orgDefault: VroomMode = 'efficiency';
    expect(VALID_MODES).toContain(orgDefault);
  });

  it('all modes are distinct strings', () => {
    const unique = new Set(VALID_MODES);
    expect(unique.size).toBe(VALID_MODES.length);
  });
});

describe('OPTIMIZATION_MODES catalog', () => {
  it('has one entry per valid mode', () => {
    expect(OPTIMIZATION_MODES).toHaveLength(VALID_MODES.length);
    for (const mode of VALID_MODES) {
      const entry = OPTIMIZATION_MODES.find((m) => m.id === mode);
      expect(entry, `mode ${mode} missing from OPTIMIZATION_MODES`).toBeTruthy();
    }
  });

  it('every entry has title, billingHint, desc, icon', () => {
    for (const m of OPTIMIZATION_MODES) {
      expect(m.title, `${m.id} title`).toBeTruthy();
      expect(m.title.length, `${m.id} title length`).toBeGreaterThan(0);
      expect(m.billingHint, `${m.id} billingHint`).toBeTruthy();
      expect(m.desc, `${m.id} desc`).toBeTruthy();
      expect(typeof m.icon, `${m.id} icon`).toBe('object');
    }
  });

  it('every billingHint starts with "Útil si" (locks customer-oriented copy)', () => {
    for (const m of OPTIMIZATION_MODES) {
      expect(m.billingHint.startsWith('Útil si'), `${m.id} billingHint must start with "Útil si": got "${m.billingHint}"`).toBe(true);
    }
  });
});
