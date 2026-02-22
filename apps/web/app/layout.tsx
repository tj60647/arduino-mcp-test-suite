import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MCP Agent Eval Suite',
  description: 'Collaborative run dashboard for mechanistic and epistemic MCP agent evaluations'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-theme="base">{children}</body>
    </html>
  );
}
