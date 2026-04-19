import { supabase } from '@/application/lib/supabase';
import {
  useSessionStore,
  type MembershipRow,
} from '@/application/store/useSessionStore';
import type { Organization } from '@/data/types/database';

const ORG_STORAGE_KEY = 'vuoo_current_org_id';

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

async function fetchMemberships(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organization:organizations(*)')
    .eq('user_id', userId);

  if (error) return [];
  return (data ?? []) as unknown as MembershipRow[];
}

function pickOrg(memberships: MembershipRow[]): Organization | null {
  if (memberships.length === 0) return null;
  const ls = safeLocalStorage();
  const savedOrgId = ls?.getItem(ORG_STORAGE_KEY);
  const saved = memberships.find((m) => m.org_id === savedOrgId);
  if (saved) return saved.organization;

  const first = memberships[0].organization;
  ls?.setItem(ORG_STORAGE_KEY, memberships[0].org_id);
  return first;
}

async function loadMembershipsAndOrg(userId: string) {
  const memberships = await fetchMemberships(userId);
  const org = pickOrg(memberships);
  const store = useSessionStore.getState();
  store.setMemberships(memberships, org);
  store.setLoading(false);
}

let lastUserId: string | null = null;

export function initAuthSync(): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;

    const u = session?.user ?? null;
    const prevId = lastUserId;
    lastUserId = u?.id ?? null;

    const store = useSessionStore.getState();
    store.setIsSuperAdmin(u?.app_metadata?.is_super_admin === true);

    if (!u) {
      store.reset();
      return;
    }

    if (u.id === prevId) return;

    // Nuevo login: marcar loading + cargar memberships fuera del auth lock
    // (workaround del bug auth-js #762 con setTimeout(0)).
    store.setLoading(true);
    store.setUser(u);
    setTimeout(() => {
      void loadMembershipsAndOrg(u.id);
    }, 0);
  });

  return () => subscription.unsubscribe();
}

export async function refreshMemberships(): Promise<void> {
  const { user } = useSessionStore.getState();
  if (!user) return;
  await loadMembershipsAndOrg(user.id);
}

export function selectOrg(org: Organization): void {
  const ls = safeLocalStorage();
  ls?.setItem(ORG_STORAGE_KEY, org.id);
  useSessionStore.getState().setCurrentOrg(org);
}

export async function signOut(): Promise<void> {
  const ls = safeLocalStorage();
  ls?.removeItem(ORG_STORAGE_KEY);
  await supabase.auth.signOut();
}
