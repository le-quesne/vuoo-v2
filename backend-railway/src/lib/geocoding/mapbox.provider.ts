import type { GeocodingProvider, GeocodeInput, GeocodeResult } from './provider.js';

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
const CONCURRENCY = 10;
const MAX_RETRIES = 3;

if (!MAPBOX_TOKEN) {
  // No throw at import time — si la app no usa mapbox en runtime, no debe crashear al cargar.
  console.warn('[mapbox.provider] MAPBOX_TOKEN no configurado.');
}

async function geocodeOne(input: GeocodeInput, attempt = 1): Promise<GeocodeResult> {
  try {
    const qs = new URLSearchParams({
      access_token: MAPBOX_TOKEN ?? '',
      limit: '1',
      language: 'es',
    });
    if (input.country) qs.set('country', input.country.toLowerCase());

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      input.address,
    )}.json?${qs.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status >= 500 && attempt <= MAX_RETRIES) {
        await delay(200 * Math.pow(2, attempt));
        return geocodeOne(input, attempt + 1);
      }
      return { id: input.id, lat: null, lng: null, confidence: null, provider: 'mapbox', error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      features?: Array<{ center: [number, number]; relevance: number }>;
    };
    const feature = data.features?.[0];
    if (!feature) {
      return { id: input.id, lat: null, lng: null, confidence: null, provider: 'mapbox', error: 'not_found' };
    }
    const [lng, lat] = feature.center;
    return {
      id: input.id,
      lat,
      lng,
      confidence: feature.relevance ?? null,
      provider: 'mapbox',
    };
  } catch (e) {
    if (attempt <= MAX_RETRIES) {
      await delay(200 * Math.pow(2, attempt));
      return geocodeOne(input, attempt + 1);
    }
    return {
      id: input.id,
      lat: null,
      lng: null,
      confidence: null,
      provider: 'mapbox',
      error: e instanceof Error ? e.message : 'unknown',
    };
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mapboxProvider: GeocodingProvider = {
  name: 'mapbox',
  async geocode(inputs) {
    const results: GeocodeResult[] = [];
    for (let i = 0; i < inputs.length; i += CONCURRENCY) {
      const batch = inputs.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(batch.map((inp) => geocodeOne(inp)));
      results.push(...settled);
    }
    return results;
  },
};
