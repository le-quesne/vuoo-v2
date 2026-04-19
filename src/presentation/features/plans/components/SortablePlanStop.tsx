import {
  Check,
  GripVertical,
  Link2,
  MapPin,
  Send,
  Trash2,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusBadge } from './StatusBadge';
import type { NotificationLog, Order, PlanStopWithStop } from '@/data/types/database';

type OrderLite = Order | null;

interface SortablePlanStopProps {
  planStop: PlanStopWithStop;
  order: number | null;
  color: string;
  selected: boolean;
  order_obj: OrderLite;
  notifLogs: NotificationLog[];
  copied: boolean;
  onSelect: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}

export function SortablePlanStop({
  planStop,
  order,
  color,
  selected,
  order_obj,
  notifLogs,
  copied,
  onSelect,
  onCopyLink,
  onDelete,
}: SortablePlanStopProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: planStop.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-2 p-2 text-xs rounded cursor-pointer ${
        selected ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
        title="Arrastrar"
      >
        <GripVertical size={12} />
      </button>
      {order !== null ? (
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center font-medium text-[10px] text-white shrink-0"
          style={{ backgroundColor: color }}
        >
          {order}
        </span>
      ) : (
        <MapPin size={12} className="text-gray-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="font-medium truncate">{planStop.stop.name}</div>
          {order_obj && (
            <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1 py-px rounded shrink-0">
              {order_obj.order_number}
            </span>
          )}
        </div>
        <div className="text-gray-400 truncate">{planStop.stop.address ?? ''}</div>
        {order_obj && (
          <div className="text-[10px] text-gray-400 truncate">
            {(() => {
              const itemCount = order_obj.items?.length ?? 0;
              const parts: string[] = [];
              if (itemCount > 0) parts.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
              if (order_obj.total_weight_kg > 0) parts.push(`${order_obj.total_weight_kg} kg`);
              return parts.join(' · ');
            })()}
          </div>
        )}
        {notifLogs.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            {notifLogs.some((l) => l.channel === 'whatsapp') && (
              <span className="w-2 h-2 rounded-full bg-green-500" title="WhatsApp enviado" />
            )}
            {notifLogs.some((l) => l.channel === 'email') && (
              <span className="w-2 h-2 rounded-full bg-blue-500" title="Email enviado" />
            )}
            {notifLogs.some((l) => l.channel === 'sms') && (
              <span className="w-2 h-2 rounded-full bg-purple-500" title="SMS enviado" />
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {planStop.tracking_token && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopyLink();
            }}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
            title="Copiar link de seguimiento"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Link2 size={12} />}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
          title="Reenviar notificacion"
        >
          <Send size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          title="Eliminar del plan"
        >
          <Trash2 size={12} />
        </button>
        <StatusBadge status={planStop.status} />
      </div>
    </div>
  );
}
