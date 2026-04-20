import { MAPBOX_TOKEN } from '@/application/lib/mapbox';

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=1&language=es`,
    );
    const data = await res.json();
    const feat = data.features?.[0];
    if (!feat) return null;
    const [lng, lat] = feat.center;
    return { lat, lng };
  } catch {
    return null;
  }
}
