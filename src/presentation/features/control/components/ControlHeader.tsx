import { useEffect, useRef, useState } from 'react';
import { format, addDays, subDays, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  MoreHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { PresentUser } from '../hooks/useControlPresence';

interface ControlHeaderProps {
  selectedDate: Date;
  onDateChange: (d: Date) => void;
  muted: boolean;
  onToggleMute: () => void;
  highUnackedCount: number;
  showAlerts: boolean;
  onToggleAlerts: () => void;
  presentUsers: PresentUser[];
  currentUserId: string | undefined;
  onOpenBroadcast: () => void;
  onOpenIncident: () => void;
}

export function ControlHeader({
  selectedDate,
  onDateChange,
  muted,
  onToggleMute,
  highUnackedCount,
  showAlerts,
  onToggleAlerts,
  presentUsers,
  currentUserId,
  onOpenBroadcast,
  onOpenIncident,
}: ControlHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [moreOpen]);

  return (
    <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"
          title="Live"
          aria-label="Live"
        />
        <h1 className="text-base font-semibold tracking-tight text-gray-900">Torre de Control</h1>
        <span className="text-sm text-gray-500">
          {isToday(selectedDate)
            ? `Hoy · ${format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}`
            : format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onDateChange(subDays(selectedDate, 1))}
          className="p-2 rounded hover:bg-gray-100 text-gray-500"
          title="Día anterior"
        >
          <ChevronLeft size={16} />
        </button>
        {!isToday(selectedDate) && (
          <button
            onClick={() => onDateChange(new Date())}
            className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Hoy
          </button>
        )}
        <button
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="p-2 rounded hover:bg-gray-100 text-gray-500"
          title="Día siguiente"
        >
          <ChevronRight size={16} />
        </button>
        {presentUsers.length > 1 && (
          <div
            className="ml-2 flex items-center -space-x-1.5"
            title={`${presentUsers.length} dispatchers viendo ahora: ${presentUsers
              .map((u) => u.email ?? u.user_id.slice(0, 8))
              .join(', ')}`}
          >
            {presentUsers.slice(0, 4).map((u) => {
              const initial = (u.email ?? u.user_id).charAt(0).toUpperCase();
              return (
                <div
                  key={u.user_id}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white ${
                    u.user_id === currentUserId ? 'bg-blue-500' : 'bg-gray-400'
                  }`}
                >
                  {initial}
                </div>
              );
            })}
            {presentUsers.length > 4 && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-gray-600 text-[10px] font-bold border-2 border-white bg-gray-100">
                +{presentUsers.length - 4}
              </div>
            )}
          </div>
        )}
        <button
          onClick={onToggleMute}
          className="ml-2 p-2 rounded hover:bg-gray-100 text-gray-500"
          title={muted ? 'Activar sonido de alertas' : 'Silenciar alertas'}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button
          onClick={onToggleAlerts}
          className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded ml-2 border ${
            showAlerts
              ? 'border-gray-300 bg-gray-100 text-gray-900'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
          title="Alertas"
        >
          <Bell size={14} />
          Alertas
          {highUnackedCount > 0 && (
            <span className="ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
              {highUnackedCount}
            </span>
          )}
        </button>
        <button
          onClick={onOpenBroadcast}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
          title="Enviar mensaje a todos los conductores en ruta"
        >
          <Megaphone size={14} />
          Mensaje
        </button>
        <div className="ml-1 relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            title="Más acciones"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={16} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 min-w-[180px] rounded-md border border-gray-200 bg-white text-gray-900 shadow-lg py-1 z-30"
            >
              <button
                onClick={() => {
                  setMoreOpen(false);
                  onOpenIncident();
                }}
                role="menuitem"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
              >
                <AlertTriangle size={14} className="text-amber-600" />
                Registrar incidente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
