'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import type { Listing, ListingCategory } from '@/lib/types';
import { formatPrice, formatRentalPrice, lotLabel } from '@/lib/utils';
import { TOWNS, REGION_LABELS } from '@/lib/areas';
import { MAP_CENTER, MAP_ZOOM } from '@/lib/config';

type Bounds = { swLat: number; swLng: number; neLat: number; neLng: number };

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const townLayerRef = useRef<L.LayerGroup | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [category, setCategory] = useState<ListingCategory | 'all'>('all');
  const [showTowns, setShowTowns] = useState(true);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(MAP_CENTER, MAP_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Town labels sit on their own layer, added first so listing markers draw on top.
    townLayerRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      townLayerRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Render / clear town markers
  useEffect(() => {
    const layer = townLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showTowns) return;

    for (const t of TOWNS) {
      L.circleMarker([t.lat, t.lng], {
        radius: 4,
        color: '#fff',
        weight: 1,
        fillColor: '#6b7280',
        fillOpacity: 0.9,
      })
        .bindTooltip(t.name, { permanent: true, direction: 'top', className: 'town-label', opacity: 0.8 })
        .addTo(layer);
    }
  }, [showTowns]);

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
    const params = new URLSearchParams({ category: cat, noPriceCap: 'true' });
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
      const lot = l.lot_sqft ? ` · ${lotLabel(l.lot_sqft)}` : '';
      const regionLabel = REGION_LABELS[l.region] ?? l.region;
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
          <div style="color:#6b7280;font-size:11px">${l.neighborhood}, ${regionLabel}</div>
          <div style="font-weight:700;font-size:18px;margin-top:4px">${price}</div>
          <div style="color:#4b5563;font-size:11px;margin-top:2px">${beds}${baths}${sqft}${lot}</div>
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
          onClick={() => setShowTowns(v => !v)}
          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
            showTowns ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Towns
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
