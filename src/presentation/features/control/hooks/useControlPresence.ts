import { useEffect, useState } from 'react';
import { supabase } from '@/application/lib/supabase';

export interface PresentUser {
  user_id: string;
  email: string | null;
}

export function useControlPresence(
  orgId: string | null,
  userId: string | null,
  userEmail: string | null,
): PresentUser[] {
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);

  useEffect(() => {
    if (!orgId || !userId) return;

    const channel = supabase.channel(`presence-control-${orgId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresentUser>();
        const flat = Object.values(state)
          .flat()
          .map((p) => ({ user_id: p.user_id, email: p.email ?? null }));
        // Deduplicar por user_id (mismo user en múltiples pestañas).
        const uniq = Array.from(new Map(flat.map((p) => [p.user_id, p])).values());
        setPresentUsers(uniq);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, email: userEmail ?? null });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, userId, userEmail]);

  return presentUsers;
}
