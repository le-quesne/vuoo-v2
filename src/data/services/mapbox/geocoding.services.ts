import { MAPBOX_TOKEN } from '@/application/lib/mapbox';

export interface MapboxSuggestion {
  place_name: string;
  center: [number, number];
}

const DEFAULT_COUNTRIES = ['CL', 'AR'];

export async function forwardGeocode(
  query: string,
  opts: { countries?: string[]; limit?: number } = {},
): Promise<MapboxSuggestion[]> {
  if (query.trim().length < 3) return [];
  const country = (opts.countries?.length ? opts.countries : DEFAULT_COUNTRIES).join(',').toLowerCase();
  const limit = opts.limit ?? 5;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${MAPBOX_TOKEN}&country=${country}&limit=${limit}&language=es`,
    );
    const data = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}
