import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImportRecovery } from './useImportRecovery';
import { emptyMapping } from '../types/import.types';
import { RECOVERY_TTL_MS } from '../constants';

const ORG = 'org-1';
const KEY = `vuoo:import-wizard:${ORG}`;

function makeSnap(step: 1 | 2 | 3 | 4 = 2) {
  return {
    step,
    fileName: 'x.csv',
    headers: ['a', 'b'],
    rawRows: [{ a: '1', b: '2' }],
    mapping: emptyMapping(),
    templateId: null,
    previewRows: [],
  };
}

describe('useImportRecovery', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('save + load round-trip', () => {
    const { result } = renderHook(() => useImportRecovery(ORG));
    act(() => {
      result.current.save(makeSnap(3));
    });
    const loaded = result.current.load();
    expect(loaded?.step).toBe(3);
    expect(loaded?.fileName).toBe('x.csv');
    expect(loaded?.savedAt).toBeTypeOf('number');
  });

  it('load devuelve null cuando no hay snapshot', () => {
    const { result } = renderHook(() => useImportRecovery(ORG));
    expect(result.current.load()).toBeNull();
  });

  it('load expira tras TTL y limpia el item', () => {
    const { result } = renderHook(() => useImportRecovery(ORG));
    act(() => {
      result.current.save(makeSnap());
    });
    // Forzar expiración: re-escribir con savedAt en el pasado lejano.
    const raw = window.localStorage.getItem(KEY)!;
    const parsed = JSON.parse(raw) as { v: number; data: { savedAt: number } };
    parsed.data.savedAt = Date.now() - RECOVERY_TTL_MS - 1000;
    window.localStorage.setItem(KEY, JSON.stringify(parsed));

    expect(result.current.load()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('load devuelve null si JSON corrupto, sin crash', () => {
    window.localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => useImportRecovery(ORG));
    expect(result.current.load()).toBeNull();
  });

  it('load ignora envelope con v incorrecta', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 99, data: makeSnap() }));
    const { result } = renderHook(() => useImportRecovery(ORG));
    expect(result.current.load()).toBeNull();
  });

  it('clear remueve el snapshot', () => {
    const { result } = renderHook(() => useImportRecovery(ORG));
    act(() => result.current.save(makeSnap()));
    expect(result.current.load()).not.toBeNull();
    act(() => result.current.clear());
    expect(result.current.load()).toBeNull();
  });

  it('save es no-op si orgId es undefined', () => {
    const { result } = renderHook(() => useImportRecovery(undefined));
    act(() => result.current.save(makeSnap()));
    expect(window.localStorage.length).toBe(0);
  });
});
