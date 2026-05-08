import { useEffect } from 'react';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
}

interface Props {
  attendees: MapPoint[];
  destination: MapPoint;
  /** Optional: a label-less midpoint marker (e.g. the geographic centroid). */
  centroid?: { lat: number; lng: number };
  /** Tailwind height class. Defaults to h-80 (~20rem). */
  heightClass?: string;
}

const PRIMARY = '#7c3aed';
const WARM = '#f59e0b';
const SLATE = '#94a3b8';

/**
 * Renders a Google Map with a marker for each attendee, a larger destination
 * marker, and lines from each attendee to the destination. Auto-fits to show
 * everyone on screen.
 */
export default function LocationMap({ attendees, destination, centroid, heightClass = 'h-80' }: Props) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  if (!apiKey) {
    return (
      <div className="card text-sm text-slate-500">
        Map not available — <code>VITE_GOOGLE_MAPS_BROWSER_KEY</code> is not set.
        See README for setup steps.
      </div>
    );
  }

  return (
    <div className={`${heightClass} rounded-xl overflow-hidden border border-primary-100 shadow-soft`}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={destination}
          defaultZoom={6}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
        >
          {attendees.map((a, i) => (
            <Marker
              key={`a-${i}`}
              position={{ lat: a.lat, lng: a.lng }}
              title={`${a.label}${a.sublabel ? ` — ${a.sublabel}` : ''}`}
              icon={{
                path: 0, // google.maps.SymbolPath.CIRCLE
                fillColor: PRIMARY,
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
                scale: 8,
              }}
              label={{
                text: a.label.slice(0, 1).toUpperCase(),
                color: '#fff',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            />
          ))}

          <Marker
            position={{ lat: destination.lat, lng: destination.lng }}
            title={`📍 ${destination.label}`}
            icon={{
              path: 'M -2,-2 L 2,-2 L 2,2 L -2,2 z', // square
              fillColor: WARM,
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
              scale: 4,
              rotation: 45, // diamond
            }}
          />

          <FitToBounds attendees={attendees} destination={destination} />
          <Polylines attendees={attendees} destination={destination} />
          {centroid && <CentroidDot centroid={centroid} />}
        </Map>
      </APIProvider>
    </div>
  );
}

/* ---------------- Imperative-API helpers ---------------- */

function FitToBounds({ attendees, destination }: { attendees: MapPoint[]; destination: MapPoint }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: destination.lat, lng: destination.lng });
    for (const a of attendees) bounds.extend({ lat: a.lat, lng: a.lng });
    map.fitBounds(bounds, 60); // 60px padding
  }, [map, attendees, destination]);
  return null;
}

function Polylines({ attendees, destination }: { attendees: MapPoint[]; destination: MapPoint }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const polys = attendees.map(
      (a) =>
        new google.maps.Polyline({
          path: [
            { lat: a.lat, lng: a.lng },
            { lat: destination.lat, lng: destination.lng },
          ],
          geodesic: true,
          strokeColor: PRIMARY,
          strokeOpacity: 0.75,
          strokeWeight: 4,
          map,
        }),
    );
    return () => polys.forEach((p) => p.setMap(null));
  }, [map, attendees, destination]);
  return null;
}

function CentroidDot({ centroid }: { centroid: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const dot = new google.maps.Marker({
      position: centroid,
      map,
      title: 'Geographic centroid',
      icon: {
        path: 0, // CIRCLE
        fillColor: SLATE,
        fillOpacity: 0.5,
        strokeColor: SLATE,
        strokeWeight: 1,
        scale: 5,
      },
    });
    return () => dot.setMap(null);
  }, [map, centroid]);
  return null;
}
