import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arduino MCP Eval Suite',
  description: 'Collaborative run dashboard for Arduino MCP evaluations'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
