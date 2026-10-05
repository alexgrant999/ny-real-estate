'use client';
import { useState } from 'react';

// Redfin's CDN serves listing photos at a predictable pattern (…_0.jpg, …_1.jpg, …)
// but nothing tells us how many exist, so probe a fixed window and show what loads.
const MAX_PHOTOS = 15;

interface Props {
  imageUrl: string;
  alt: string;
}

export function PhotoGallery({ imageUrl, alt }: Props) {
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState(0);

  if (!/_0\.jpg$/.test(imageUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt={alt} className="w-full h-96 object-cover" />
    );
  }

  const candidates = Array.from({ length: MAX_PHOTOS }, (_, i) =>
    imageUrl.replace(/_0\.jpg$/, `_${i}.jpg`)
  );

  const markLoaded = (i: number) => setLoaded(prev => new Set(prev).add(i));
  const markFailed = (i: number) => setFailed(prev => new Set(prev).add(i));

  const visible = candidates.map((url, i) => ({ url, i })).filter(({ i }) => !failed.has(i));
  if (visible.length === 0) return null;

  const main = visible.find(v => v.i === selected) ?? visible[0];
  const thumbs = visible.filter(({ i }) => loaded.has(i));

  return (
    <div className="border-b border-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={main.url}
        alt={alt}
        className="w-full h-96 object-cover"
        onError={() => markFailed(main.i)}
      />
      {thumbs.length > 1 && (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {thumbs.map(({ url, i }) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`shrink-0 rounded-md overflow-hidden border-2 ${
                i === main.i ? 'border-blue-500' : 'border-transparent hover:border-gray-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${alt} photo ${i + 1}`} className="h-16 w-24 object-cover" />
            </button>
          ))}
        </div>
      )}
      {/* Probe the window invisibly; thumbnails appear as each photo confirms it exists. */}
      <div className="hidden">
        {candidates.map((url, i) =>
          loaded.has(i) || failed.has(i) ? null : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" onLoad={() => markLoaded(i)} onError={() => markFailed(i)} />
          )
        )}
      </div>
    </div>
  );
}
