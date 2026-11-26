import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bayanihan HQ',
  description: 'Barangay Mabuhay DRRM operations centre: what each Claude Code agent is doing, live.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#291C14' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
