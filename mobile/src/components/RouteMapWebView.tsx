import { useMemo, useRef } from 'react'
import {
  Platform,
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, shadow, spacing } from '@/theme'
import type { StopStatus } from '@/types/database'

export interface RouteMapStop {
  id: string
  lat: number
  lng: number
  name: string
  order: number
  status: StopStatus
}

export interface DriverLocation {
  lat: number
  lng: number
}

export interface DepotLocation {
  lat: number
  lng: number
  address?: string | null
}

interface RouteMapWebViewProps {
  stops: RouteMapStop[]
  driverLocation?: DriverLocation | null
  depot?: DepotLocation | null
  style?: StyleProp<ViewStyle>
}

// Fallback center: Santiago, Chile
const DEFAULT_CENTER: [number, number] = [-70.6506, -33.4372]

const STATUS_COLORS: Record<StopStatus, string> = {
  pending: '#64748b', // slate-500
  completed: '#10b981', // emerald-500
  incomplete: '#f59e0b', // amber-500
  cancelled: '#ef4444', // red-500
}

function buildHtml(
  token: string,
  stops: RouteMapStop[],
  driverLocation: DriverLocation | null,
  depot: DepotLocation | null,
): string {
  const stopsJson = JSON.stringify(stops)
  const driverJson = JSON.stringify(driverLocation)
  const depotJson = JSON.stringify(depot)
  const statusColorsJson = JSON.stringify(STATUS_COLORS)
  const defaultCenterJson = JSON.stringify(DEFAULT_CENTER)
  const primaryColor = colors.primary

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js"></script>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #map { position: absolute; top: 0; bottom: 0; left: 0; right: 0; }
  .stop-marker {
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #64748b;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #ffffff;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .driver-marker {
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: ${primaryColor};
    border: 3px solid #ffffff;
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.75);
    animation: pulse 1.8s infinite;
  }
  .depot-marker {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #4f46e5;
    border: 3px solid #ffffff;
    box-shadow: 0 3px 10px rgba(79, 70, 229, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .depot-marker svg { width: 16px; height: 16px; }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
    70%  { box-shadow: 0 0 0 14px rgba(59, 130, 246, 0); }
    100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
  }
  .err {
    position: absolute; top: 50%; left: 0; right: 0; text-align: center; color: #64748b;
    font-size: 13px; padding: 0 16px; transform: translateY(-50%);
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  (function () {
    try {
      var TOKEN = ${JSON.stringify(token)};
      var STOPS = ${stopsJson};
      var DRIVER = ${driverJson};
      var DEPOT = ${depotJson};
      var STATUS_COLORS = ${statusColorsJson};
      var DEFAULT_CENTER = ${defaultCenterJson};

      if (!TOKEN) {
        document.body.innerHTML = '<div class="err">Falta EXPO_PUBLIC_MAPBOX_TOKEN.</div>';
        return;
      }

      mapboxgl.accessToken = TOKEN;

      var initialCenter = DEFAULT_CENTER;
      if (DEPOT) {
        initialCenter = [DEPOT.lng, DEPOT.lat];
      } else if (STOPS && STOPS.length > 0) {
        initialCenter = [STOPS[0].lng, STOPS[0].lat];
      } else if (DRIVER) {
        initialCenter = [DRIVER.lng, DRIVER.lat];
      }

      var map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v11',
        center: initialCenter,
        zoom: 11,
        attributionControl: false,
      });

      map.addControl(new mapboxgl.AttributionControl({ compact: true }));

      var markers = [];
      var driverMarker = null;
      // Guardamos la geometria real de la ruta apenas la recibimos para que
      // el boton "re-encuadrar" use el mismo encuadre que cuando carga el mapa.
      var lastRouteCoords = null;

      function addStopMarkers() {
        STOPS.forEach(function (s, i) {
          var el = document.createElement('div');
          el.className = 'stop-marker';
          el.style.background = STATUS_COLORS[s.status] || '#64748b';
          el.textContent = String(i + 1);
          var m = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([s.lng, s.lat])
            .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setText(s.name))
            .addTo(map);
          markers.push(m);
        });
      }

      function setDriverMarker(loc) {
        if (driverMarker) {
          driverMarker.remove();
          driverMarker = null;
        }
        if (!loc) return;
        var el = document.createElement('div');
        el.className = 'driver-marker';
        driverMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
      }

      function addDepotMarker() {
        if (!DEPOT) return;
        var el = document.createElement('div');
        el.className = 'depot-marker';
        el.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
          '<polyline points="9 22 9 12 15 12 15 22"/>' +
          '</svg>';
        var popup = new mapboxgl.Popup({ offset: 22, closeButton: false })
          .setHTML(
            '<div style="font-family: system-ui; padding: 2px;">' +
              '<div style="font-weight: 600; font-size: 13px; color: #4f46e5; margin-bottom: 2px;">Depot</div>' +
              (DEPOT.address ? '<div style="font-size: 12px; color: #444;">' + DEPOT.address + '</div>' : '') +
              '</div>',
          );
        new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([DEPOT.lng, DEPOT.lat])
          .setPopup(popup)
          .addTo(map);
      }

      function fetchRealDirections(coords) {
        // Mapbox Directions API: maximo 25 waypoints por request.
        // Chunkeamos con overlap de 1 punto para unir los tramos sin saltos.
        var CHUNK = 25;
        var chunks = [];
        if (coords.length <= CHUNK) {
          chunks.push(coords);
        } else {
          for (var i = 0; i < coords.length - 1; i += CHUNK - 1) {
            var slice = coords.slice(i, i + CHUNK);
            if (slice.length >= 2) chunks.push(slice);
          }
        }

        return Promise.all(chunks.map(function (slice) {
          var coordStr = slice.map(function (c) { return c[0] + ',' + c[1]; }).join(';');
          var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' + coordStr +
                    '?access_token=' + encodeURIComponent(TOKEN) +
                    '&geometries=geojson&overview=full';
          return fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var route = data && data.routes && data.routes[0];
              if (route && route.geometry && route.geometry.coordinates) {
                return route.geometry.coordinates;
              }
              return slice;
            })
            .catch(function () { return slice; });
        })).then(function (geos) {
          var out = [];
          for (var j = 0; j < geos.length; j++) {
            var g = geos[j];
            if (!g || g.length === 0) continue;
            if (out.length === 0) {
              out.push.apply(out, g);
            } else {
              // evita duplicar el ultimo punto compartido con el siguiente tramo
              out.push.apply(out, g.slice(1));
            }
          }
          return out;
        });
      }

      map.on('load', function () {
        addStopMarkers();
        addDepotMarker();
        setDriverMarker(DRIVER);

        // Route line: depot → stops → depot (same logic as web).
        var lineStops = STOPS.slice();
        var hasDepot = !!(DEPOT && typeof DEPOT.lat === 'number' && typeof DEPOT.lng === 'number');

        if (lineStops.length >= 2 || (hasDepot && lineStops.length >= 1)) {
          var straightCoords = [];
          if (hasDepot) straightCoords.push([DEPOT.lng, DEPOT.lat]);
          for (var si = 0; si < lineStops.length; si++) {
            straightCoords.push([lineStops[si].lng, lineStops[si].lat]);
          }
          if (hasDepot) straightCoords.push([DEPOT.lng, DEPOT.lat]);

          // Colocamos primero una linea recta como placeholder instantaneo.
          map.addSource('route-line', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: straightCoords },
            },
          });
          // Borde blanco debajo para mejor contraste (igual que la web).
          map.addLayer({
            id: 'route-line-border',
            type: 'line',
            source: 'route-line',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#ffffff',
              'line-width': 6,
              'line-opacity': 0.85,
            },
          });
          map.addLayer({
            id: 'route-line-layer',
            type: 'line',
            source: 'route-line',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': ${JSON.stringify(primaryColor)},
              'line-width': 3.5,
              'line-opacity': 0.9,
            },
          });

          // En paralelo: pedimos la geometria real por calles y reemplazamos.
          fetchRealDirections(straightCoords).then(function (realCoords) {
            if (!realCoords || realCoords.length < 2) return;
            var src = map.getSource('route-line');
            if (src && src.setData) {
              src.setData({
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: realCoords },
              });
              lastRouteCoords = realCoords;
              // Reajustamos bounds a la geometria real para que quepa toda la ruta.
              try {
                var b = new mapboxgl.LngLatBounds(realCoords[0], realCoords[0]);
                for (var k = 0; k < realCoords.length; k++) b.extend(realCoords[k]);
                if (DRIVER) b.extend([DRIVER.lng, DRIVER.lat]);
                if (hasDepot) b.extend([DEPOT.lng, DEPOT.lat]);
                map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 300 });
              } catch (e) { /* ignore */ }
            }
          }).catch(function (err) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage('directions-error:' + (err && err.message || ''));
            }
          });
        }

        var boundsPoints = STOPS.map(function (s) { return [s.lng, s.lat]; });
        if (DRIVER) boundsPoints.push([DRIVER.lng, DRIVER.lat]);
        if (hasDepot) boundsPoints.push([DEPOT.lng, DEPOT.lat]);

        if (boundsPoints.length === 1) {
          map.easeTo({ center: boundsPoints[0], zoom: 13, duration: 0 });
        } else if (boundsPoints.length >= 2) {
          var bounds = boundsPoints.reduce(function (b, c) {
            return b.extend(c);
          }, new mapboxgl.LngLatBounds(boundsPoints[0], boundsPoints[0]));
          map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
        }
      });

      // Expuesta a RN: el boton flotante hace injectJavaScript('window.fitRoute(); true;')
      window.fitRoute = function () {
        try {
          var pts = [];
          if (lastRouteCoords && lastRouteCoords.length > 0) {
            pts = lastRouteCoords.slice();
          } else {
            for (var i = 0; i < STOPS.length; i++) pts.push([STOPS[i].lng, STOPS[i].lat]);
          }
          if (DEPOT && typeof DEPOT.lat === 'number' && typeof DEPOT.lng === 'number') {
            pts.push([DEPOT.lng, DEPOT.lat]);
          }
          if (DRIVER) pts.push([DRIVER.lng, DRIVER.lat]);
          if (pts.length === 0) return;
          if (pts.length === 1) {
            map.easeTo({ center: pts[0], zoom: 13, duration: 300 });
            return;
          }
          var bb = new mapboxgl.LngLatBounds(pts[0], pts[0]);
          for (var j = 0; j < pts.length; j++) bb.extend(pts[j]);
          map.fitBounds(bb, { padding: 48, maxZoom: 15, duration: 400 });
        } catch (e) { /* ignore */ }
      };

      map.on('error', function (e) {
        if (window.ReactNativeWebView && e && e.error) {
          window.ReactNativeWebView.postMessage('mapbox-error:' + (e.error.message || ''));
        }
      });
    } catch (e) {
      document.body.innerHTML = '<div class="err">Error cargando mapa: ' + (e && e.message ? e.message : e) + '</div>';
    }
  })();
</script>
</body>
</html>`
}

export function RouteMapWebView({
  stops,
  driverLocation,
  depot,
  style,
}: RouteMapWebViewProps) {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''
  const webViewRef = useRef<WebView>(null)

  const html = useMemo(
    () => buildHtml(token, stops, driverLocation ?? null, depot ?? null),
    [token, stops, driverLocation, depot],
  )

  // react-native-webview isn't supported on web — show a friendly placeholder
  // instead of the raw "does not support this platform" error.
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          El mapa se muestra solo en la app móvil.
        </Text>
        <Text style={[styles.fallbackText, { marginTop: 4, fontSize: 11 }]}>
          {stops.length} {stops.length === 1 ? 'parada' : 'paradas'} en esta ruta
        </Text>
      </View>
    )
  }

  if (!token) {
    return (
      <View style={[styles.container, styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          Configura EXPO_PUBLIC_MAPBOX_TOKEN para ver el mapa.
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
        source={{ html }}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
      <Pressable
        onPress={() =>
          webViewRef.current?.injectJavaScript(
            'if (window.fitRoute) window.fitRoute(); true;',
          )
        }
        accessibilityLabel="Re-encuadrar ruta"
        hitSlop={8}
        style={({ pressed }) => [styles.fitBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="scan-outline" size={20} color={colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    minHeight: 160,
  },
  fallbackText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  fitBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
})

export default RouteMapWebView
