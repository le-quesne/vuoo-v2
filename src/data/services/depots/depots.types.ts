// v1 mínimo de PRD 25 (Multi-Depot). No está en database.ts (autogenerado)
// todavía — se agrega acá para no tocar ese archivo a mano mientras no se
// regeneren los tipos.
export interface Depot {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export type DepotInsert = Pick<Depot, 'org_id' | 'name' | 'lat' | 'lng'> &
  Partial<Pick<Depot, 'address' | 'is_default' | 'is_active'>>;

export type DepotUpdate = Partial<
  Pick<Depot, 'name' | 'address' | 'lat' | 'lng' | 'is_default' | 'is_active'>
>;
