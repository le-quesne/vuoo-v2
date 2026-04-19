import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'HH:mm', { locale: es });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(new Date(iso), "d 'de' MMMM, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

export function fmtTimeWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return `${start ? fmtTime(start) : '?'} - ${end ? fmtTime(end) : '?'}`;
}

export const NOTIF_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};

export const NOTIF_EVENT_LABELS: Record<string, string> = {
  scheduled: 'Entrega programada',
  in_transit: 'Tu pedido salió',
  arriving: 'Está llegando',
  delivered: 'Entregado',
  failed: 'Entrega fallida',
  survey: 'Encuesta de feedback',
};
