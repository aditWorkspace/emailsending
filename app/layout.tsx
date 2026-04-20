import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'emailsendingasa',
  description: 'Daily email batch handout',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
