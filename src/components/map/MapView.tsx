'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import type { Listing, ListingCategory } from '@/lib/types';
import { formatPrice, formatRentalPrice } from '@/lib/utils';

type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };

type SubwayStation = {
  name: string;
  line: string;
  lat: number;
  lng: number;
};

const LINE_COLORS: Record<string, string> = {
  A: '#0039A6', C: '#0039A6', E: '#0039A6',
  B: '#FF6319', D: '#FF6319', F: '#FF6319', M: '#FF6319',
  G: '#6CBE45',
  J: '#996633', Z: '#996633',
  L: '#A7A9AC',
  N: '#FCCC0A', Q: '#FCCC0A', R: '#FCCC0A', W: '#FCCC0A',
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  S: '#808183',
};

function stationColor(line: string): string {
  const first = line.trim().charAt(0).toUpperCase();
  return LINE_COLORS[first] ?? '#555';
}

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const subwayLayerRef = useRef<L.LayerGroup | null>(null);
  const hoodLayerRef = useRef<L.GeoJSON | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [category, setCategory] = useState<ListingCategory | 'all'>('all');
  const [showSubway, setShowSubway] = useState(false);
  const [subwayStations, setSubwayStations] = useState<SubwayStation[]>([]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([40.73, -73.97], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    subwayLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Load NYC neighbourhood polygons (NTA boundaries) behind markers
    const where = encodeURIComponent("boroname='Manhattan' OR boroname='Brooklyn' OR boroname='Queens'");
    fetch(`https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=500&$where=${where}`)
      .then(r => r.ok ? r.json() : null)
      .then(geo => {
        if (!geo || !mapRef.current) return;
        const layer = L.geoJSON(geo, {
          style: {
            color: '#94a3b8',
            weight: 0.8,
            fillColor: '#3b82f6',
            fillOpacity: 0.07,
            opacity: 0.4,
          },
          onEachFeature(feature, featureLayer) {
            const name = feature.properties?.ntaname as string | undefined;
            if (name) featureLayer.bindTooltip(name, { opacity: 0.85, direction: 'center', permanent: false });
          },
        });
        layer.addTo(map);
        layer.bringToBack();
        hoodLayerRef.current = layer;
      })
      .catch(() => {/* silently fail */});

    return () => {
      map.remove();
      mapRef.current = null;
      hoodLayerRef.current = null;
    };
  }, []);

  // Fetch subway stations once on first toggle
  useEffect(() => {
    if (!showSubway || subwayStations.length > 0) return;
    fetch('https://data.cityofnewyork.us/resource/arq3-7z49.json?$limit=600')
      .then(r => r.json())
      .then((data: { name: string; line: string; the_geom: { coordinates: [number, number] } }[]) => {
        setSubwayStations(data.map(s => ({
          name: s.name,
          line: s.line,
          lat: s.the_geom.coordinates[1],
          lng: s.the_geom.coordinates[0],
        })));
      })
      .catch(() => {/* silently fail */});
  }, [showSubway, subwayStations.length]);

  // Render / clear subway markers
  useEffect(() => {
    const layer = subwayLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showSubway) return;

    for (const s of subwayStations) {
      const color = stationColor(s.line);
      const lines = s.line.split(' ').filter(Boolean);
      const badges = lines.map(l =>
        `<span style="display:inline-block;background:${LINE_COLORS[l.toUpperCase()] ?? '#555'};color:${l === 'N' || l === 'Q' || l === 'R' || l === 'W' ? '#000' : '#fff'};width:16px;height:16px;border-radius:50%;font-size:9px;font-weight:700;text-align:center;line-height:16px;margin-right:2px">${l}</span>`
      ).join('');

      L.circleMarker([s.lat, s.lng], {
        radius: 5,
        color: '#fff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindTooltip(`<strong>${s.name}</strong><br/>${badges}`, { direction: 'top', opacity: 0.95 })
        .addTo(layer);
    }
  }, [showSubway, subwayStations]);

  // Draw-a-box interaction
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!drawing) {
      map.dragging.enable();
      return;
    }

    map.dragging.disable();
    let startLatLng: L.LatLng | null = null;
    let tempRect: L.Rectangle | null = null;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      startLatLng = e.latlng;
      if (tempRect) { tempRect.remove(); tempRect = null; }
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!startLatLng) return;
      const bounds = L.latLngBounds(startLatLng, e.latlng);
      if (tempRect) tempRect.setBounds(bounds);
      else {
        tempRect = L.rectangle(bounds, { color: '#3b82f6', weight: 2, fillOpacity: 0.1 }).addTo(map);
      }
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!startLatLng) return;
      const sw = L.latLngBounds(startLatLng, e.latlng).getSouthWest();
      const ne = L.latLngBounds(startLatLng, e.latlng).getNorthEast();
      startLatLng = null;

      if (rectRef.current) rectRef.current.remove();
      if (tempRect) { rectRef.current = tempRect; tempRect = null; }

      setBounds({ swLat: sw.lat, swLng: sw.lng, neLat: ne.lat, neLng: ne.lng });
      setDrawing(false);
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.dragging.enable();
      if (tempRect) tempRect.remove();
    };
  }, [drawing]);

  // Fetch listings
  const fetchListings = useCallback((b: Bounds | null, cat: ListingCategory | 'all') => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '2000', category: cat, noPriceCap: 'true' });
    if (b) {
      params.set('swLat', b.swLat.toFixed(6));
      params.set('swLng', b.swLng.toFixed(6));
      params.set('neLat', b.neLat.toFixed(6));
      params.set('neLng', b.neLng.toFixed(6));
    }
    fetch(`/api/listings?${params}`)
      .then(r => r.json())
      .then(d => {
        setListings((d.listings as Listing[]).filter(l => l.lat && l.lng));
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchListings(bounds, category);
  }, [bounds, category, fetchListings]);

  // Update markers when listings change
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    markers.clearLayers();

    const saleIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [18, 30], iconAnchor: [9, 30], popupAnchor: [1, -24], shadowSize: [30, 30],
    });

    const rentalIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [18, 30], iconAnchor: [9, 30], popupAnchor: [1, -24], shadowSize: [30, 30],
    });

    for (const l of listings) {
      if (!l.lat || !l.lng) continue;
      const icon = l.listing_category === 'rental' ? rentalIcon : saleIcon;
      const price = l.listing_category === 'rental' ? formatRentalPrice(l.price) : formatPrice(l.price);
      const beds = l.bedrooms === 0 ? 'Studio' : `${l.bedrooms ?? '?'} bed`;
      const baths = l.bathrooms ? ` · ${l.bathrooms} bath` : '';
      const sqft = l.sqft ? ` · ${l.sqft.toLocaleString()} ft²` : '';
      const tag = l.listing_category === 'rental'
        ? '<span style="background:#f3e8ff;color:#7c3aed;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600">RENTAL</span>'
        : '';
      const typeTag = l.listing_type
        ? `<span style="background:#f3f4f6;color:#4b5563;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600;margin-left:4px">${l.listing_type}</span>`
        : '';

      const popup = `
        <div style="min-width:200px;font-family:system-ui,sans-serif">
          <a href="/listing/${l.id}" style="font-weight:600;color:#2563eb;text-decoration:none;font-size:13px">
            ${l.address}${l.unit ? ` #${l.unit}` : ''}
          </a>
          <div style="color:#6b7280;font-size:11px">${l.neighborhood}, ${l.borough}</div>
          <div style="font-weight:700;font-size:18px;margin-top:4px">${price}</div>
          <div style="color:#4b5563;font-size:11px;margin-top:2px">${beds}${baths}${sqft}</div>
          <div style="margin-top:4px">${tag}${typeTag}</div>
        </div>
      `;

      L.marker([l.lat, l.lng], { icon }).bindPopup(popup).addTo(markers);
    }
  }, [listings]);

  const clearBounds = useCallback(() => {
    setBounds(null);
    setDrawing(false);
    if (rectRef.current) { rectRef.current.remove(); rectRef.current = null; }
  }, []);

  // Escape to cancel draw or clear area
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearBounds(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [clearBounds]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="relative z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 text-sm">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['all', 'sale', 'rental'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 ${
                category === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {c === 'all' ? 'All' : c === 'sale' ? 'For Sale' : 'Rentals'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setDrawing(!drawing)}
          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            drawing ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {drawing ? 'Drawing... (drag on map)' : 'Draw area'}
        </button>

        {bounds && (
          <button
            onClick={clearBounds}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-red-600 hover:bg-red-50"
          >
            Clear area
          </button>
        )}

        <button
          onClick={() => setShowSubway(v => !v)}
          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            showSubway ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Subway
        </button>

        <span className="text-gray-500 ml-auto">
          {loading ? 'Loading...' : `${listings.length} of ${total} on map`}
          {bounds && ' (filtered by area)'}
        </span>
      </div>

      <div ref={containerRef} className={`flex-1 ${drawing ? 'cursor-crosshair' : ''}`} />
    </div>
  );
}
