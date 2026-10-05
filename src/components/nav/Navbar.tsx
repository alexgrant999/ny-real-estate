'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/listings', label: 'Listings' },
  { href: '/map', label: 'Map' },
  { href: '/deals', label: 'Deals' },
  { href: '/compare', label: 'Compare' },
  { href: '/market', label: 'Market Trends' },
  { href: '/import', label: 'Import Data' },
];

export function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-4 flex items-center h-14 gap-8">
        <Link href="/" className="font-bold text-lg text-gray-900 shrink-0">
          NYC Apartments
        </Link>
        <div className="flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname.startsWith(l.href)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
