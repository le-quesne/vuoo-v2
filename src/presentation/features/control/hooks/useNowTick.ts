import { useEffect, useState } from 'react';
import { NOW_TICK_MS } from '@/presentation/features/control/constants';

export function useNowTick(intervalMs: number = NOW_TICK_MS): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}
