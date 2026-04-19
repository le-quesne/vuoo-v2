import {
  useSessionStore,
  selectOrgRole,
  selectIsDriver,
  type MembershipRow,
} from '@/application/store/useSessionStore';
import {
  refreshMemberships,
  selectOrg as selectOrgAction,
  signOut as signOutAction,
} from '@/application/lib/auth';
import type { Organization, OrgRole } from '@/data/types/database';
import type { User } from '@supabase/supabase-js';

export interface UseAuthReturn {
  user: User | null;
  currentOrg: Organization | null;
  orgMemberships: MembershipRow[];
  orgRole: OrgRole | null;
  isSuperAdmin: boolean;
  isDriver: boolean;
  loading: boolean;
  setCurrentOrg: (org: Organization) => void;
  refreshMemberships: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const user = useSessionStore((s) => s.user);
  const currentOrg = useSessionStore((s) => s.currentOrg);
  const orgMemberships = useSessionStore((s) => s.orgMemberships);
  const isSuperAdmin = useSessionStore((s) => s.isSuperAdmin);
  const loading = useSessionStore((s) => s.loading);
  const orgRole = useSessionStore(selectOrgRole);
  const isDriver = useSessionStore(selectIsDriver);

  return {
    user,
    currentOrg,
    orgMemberships,
    orgRole,
    isSuperAdmin,
    isDriver,
    loading,
    setCurrentOrg: selectOrgAction,
    refreshMemberships,
    signOut: signOutAction,
  };
}
