import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import type { Organization, OrganizationMember, OrgRole } from '@/data/types/database';

export type MembershipRow = OrganizationMember & { organization: Organization };

export interface SessionState {
  user: User | null;
  currentOrg: Organization | null;
  orgMemberships: MembershipRow[];
  isSuperAdmin: boolean;
  loading: boolean;

  setUser: (user: User | null) => void;
  setIsSuperAdmin: (value: boolean) => void;
  setMemberships: (memberships: MembershipRow[], currentOrg: Organization | null) => void;
  setCurrentOrg: (org: Organization | null) => void;
  setLoading: (value: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  currentOrg: null,
  orgMemberships: [],
  isSuperAdmin: false,
  loading: true,

  setUser: (user) => set({ user }),
  setIsSuperAdmin: (value) => set({ isSuperAdmin: value }),
  setMemberships: (memberships, currentOrg) =>
    set({ orgMemberships: memberships, currentOrg }),
  setCurrentOrg: (org) => set({ currentOrg: org }),
  setLoading: (value) => set({ loading: value }),
  reset: () =>
    set({
      user: null,
      currentOrg: null,
      orgMemberships: [],
      isSuperAdmin: false,
      loading: false,
    }),
}));

export function selectOrgRole(state: SessionState): OrgRole | null {
  const currentId = state.currentOrg?.id;
  if (!currentId) return null;
  return state.orgMemberships.find((m) => m.org_id === currentId)?.role ?? null;
}

export function selectIsDriver(state: SessionState): boolean {
  return state.user?.app_metadata?.role === 'driver';
}
