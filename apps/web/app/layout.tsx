import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arduino MCP Tester',
  description:
    'Run standardised Arduino test scenarios against any MCP server and score it on task accuracy, safety awareness, and reasoning quality.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
