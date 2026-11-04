import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL('https://lattice.abhijeet-anand.com'),
  title: 'Lattice — Your personal knowledge library',
  description:
    'A calm space to capture what you learn. Save articles, podcasts, books, and the ideas you want to remember.',
  icons: { icon: '/brand/lattice.png' },
  openGraph: {
    title: 'Lattice',
    description: 'Your knowledge, together.',
    type: 'website',
    images: [{ url: '/og.png', alt: 'Lattice — Capture. Connect. Build. Grow.' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.png'],
    title: 'Lattice',
    description: 'Your knowledge, together.',
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
