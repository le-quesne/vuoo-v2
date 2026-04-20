import { mapboxProvider } from './mapbox.provider.js';

export interface GeocodeInput {
  id: string;
  address: string;
  country?: string; // ISO-2, e.g. 'CL'
}

export interface GeocodeResult {
  id: string;
  lat: number | null;
  lng: number | null;
  confidence: number | null; // 0..1
  provider: 'mapbox' | 'google' | 'manual';
  error?: string;
}

export interface GeocodingProvider {
  readonly name: 'mapbox' | 'google';
  geocode(inputs: GeocodeInput[]): Promise<GeocodeResult[]>;
}

/**
 * Factory que retorna el proveedor configurado via `GEOCODING_PROVIDER`.
 * Para agregar Google: crear `google.provider.ts` con `googleProvider: GeocodingProvider`
 * y añadir el case acá.
 */
export function getGeocodingProvider(): GeocodingProvider {
  const choice = (process.env.GEOCODING_PROVIDER ?? 'mapbox').toLowerCase();
  switch (choice) {
    case 'mapbox':
      return mapboxProvider;
    case 'google':
      throw new Error(
        'GeocodingProvider "google" aún no implementado. Crear google.provider.ts.',
      );
    default:
      throw new Error(`GEOCODING_PROVIDER desconocido: ${choice}`);
  }
}
