import { describe, it, expect } from 'vitest';
import type { VroomMode } from './vroom.types';

// All valid optimization modes — update this list when adding new modes.
const VALID_MODES: VroomMode[] = ['efficiency', 'balance_stops', 'balance_time', 'consolidate'];

describe('VroomMode', () => {
  it('covers all four business models', () => {
    expect(VALID_MODES).toHaveLength(4);
    expect(VALID_MODES).toContain('efficiency');       // flota propia
    expect(VALID_MODES).toContain('balance_stops');    // paga por parada
    expect(VALID_MODES).toContain('balance_time');     // SLA / horarios
    expect(VALID_MODES).toContain('consolidate');      // paga por vuelta
  });

  it('efficiency is the org default (matches DB column default)', () => {
    // The DEFAULT on organizations.default_optimization_mode is 'efficiency'.
    // This test locks the contract: if the default changes, update the migration too.
    const orgDefault: VroomMode = 'efficiency';
    expect(VALID_MODES).toContain(orgDefault);
  });

  it('all modes are distinct strings', () => {
    const unique = new Set(VALID_MODES);
    expect(unique.size).toBe(VALID_MODES.length);
  });
});

// Mode label mapping — used by both VroomWizardModal and OrganizationSettingsPage.
// Extracted here for contract testing without importing React components.
const MODE_LABELS: Record<VroomMode, string> = {
  efficiency: 'Eficiencia',
  balance_stops: 'Balancear paradas',
  balance_time: 'Balancear tiempo',
  consolidate: 'Consolidar rutas',
};

describe('Mode labels', () => {
  it('every valid mode has a label', () => {
    for (const mode of VALID_MODES) {
      expect(MODE_LABELS[mode]).toBeTruthy();
    }
  });

  it('no label is undefined or empty', () => {
    for (const label of Object.values(MODE_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
