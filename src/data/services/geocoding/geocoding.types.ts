// Tipos del proxy de geocoding (PRD 12, Fase B.3).

export interface GeocodeAddressInput {
  id: string;
  address: string;
  country?: string; // ISO-3166 alpha-2, ej 'CL'
}

export interface GeocodeRequest {
  addresses: GeocodeAddressInput[];
}

export interface GeocodeResult {
  id: string;
  lat: number;
  lng: number;
  confidence: number; // 0..1
  provider: 'mapbox' | 'google' | 'manual' | string;
  fromCache: boolean;
}

export interface GeocodeBatchResponse {
  results: GeocodeResult[];
}
