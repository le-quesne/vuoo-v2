import { useEffect, useRef } from 'react';
import AlertFeed from './AlertFeed';
import type { LiveAlert } from '@/domain/entities/liveControl';

interface ControlAlertsPopoverProps {
  open: boolean;
  onClose: () => void;
  alerts: LiveAlert[];
  nowMs: number;
  onAcknowledge: (id: string) => void;
  onSelectRoute: (routeId: string) => void;
}

export function ControlAlertsPopover({
  open,
  onClose,
  alerts,
  nowMs,
  onAcknowledge,
  onSelectRoute,
}: ControlAlertsPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-40 w-[360px] max-h-[70vh] shadow-xl rounded-lg overflow-hidden"
    >
      <AlertFeed
        alerts={alerts}
        nowMs={nowMs}
        onAcknowledge={onAcknowledge}
        onSelect={(alert) => {
          if (alert.routeId) onSelectRoute(alert.routeId);
          onClose();
        }}
      />
    </div>
  );
}
