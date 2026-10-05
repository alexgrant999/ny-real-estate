'use client';

import dynamic from 'next/dynamic';

// Leaflet must be loaded client-side only (no SSR)
const MapView = dynamic(
  () => import('@/components/map/MapView').then(mod => ({ default: mod.default })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-[calc(100vh-56px)]">Loading map...</div> }
);

export default function MapPage() {
  return <MapView />;
}
