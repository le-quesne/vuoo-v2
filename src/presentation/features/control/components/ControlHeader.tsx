import { format, addDays, subDays, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Radio,
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
  return (
    <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Activity size={20} className="text-blue-500" />
        <h1 className="text-lg font-semibold">Torre de Control</h1>
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
          title="Dia anterior"
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
          title="Dia siguiente"
        >
          <ChevronRight size={16} />
        </button>
        <span className="ml-3 inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
          <Radio size={11} className="animate-pulse" />
          live
        </span>
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
          className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ml-2 ${
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
          className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          title="Enviar mensaje a todos los conductores en ruta"
        >
          <Megaphone size={14} />
          Mensaje
        </button>
        <button
          onClick={onOpenIncident}
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          title="Registrar incidente"
        >
          <AlertTriangle size={14} />
          Incidente
        </button>
      </div>
    </div>
  );
}
