import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import { Navbar } from '@/components/nav/Navbar';
import { APP_NAME, APP_TAGLINE } from '@/lib/config';

export const metadata: Metadata = {
  title: `${APP_NAME} – ${APP_TAGLINE}`,
  description: 'Compare homes and land for sale and rent in the Woodstock and Tannersville areas of the Catskills. Track days on market, price reductions, and find the best deals.',
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
