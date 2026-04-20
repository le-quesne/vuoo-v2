import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { MAPBOX_TOKEN } from '@/application/lib/mapbox';

interface AddressAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (address: string, coords: { lat: number; lng: number }) => void;
  placeholder?: string;
}

export function AddressAutocomplete({ value, onChange, onSelect, placeholder }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(timerRef.current);
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=5&language=es`,
        );
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const [lng, lat] = s.center;
                onSelect(s.place_name, { lat, lng });
                setOpen(false);
                setSuggestions([]);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-start gap-2"
            >
              <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="truncate">{s.place_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
