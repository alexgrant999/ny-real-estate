import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import { Navbar } from '@/components/nav/Navbar';

export const metadata: Metadata = {
  title: 'NYC Apartment Finder – Manhattan & Brooklyn',
  description: 'Compare apartments for sale in Manhattan and Brooklyn. Track days on market, price reductions, and find the best deals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
