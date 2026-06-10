import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import { prisma } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  const b = await prisma.branding.findUnique({ where: { id: 1 } }).catch(() => null);
  return {
    title: b ? `${b.companyName} · Onboarding` : 'Onboarding Hub',
    description: b?.tagline ?? 'Welcome aboard',
    icons: b?.faviconUrl ? [{ url: b.faviconUrl }] : undefined,
  };
}

export const viewport: Viewport = {
  themeColor: '#000000',
};

// Pages read DB content that can change at any time via the admin CMS, so we
// always render on request rather than at build time.
export const dynamic = 'force-dynamic';

function brandingStyle(b: Awaited<ReturnType<typeof prisma.branding.findUnique>>): CSSProperties {
  if (!b) return {};
  return {
    ['--color-bg' as any]: b.bgColor,
    ['--color-surface' as any]: b.surfaceColor,
    ['--color-border' as any]: b.borderColor,
    ['--color-text' as any]: b.textColor,
    ['--color-muted' as any]: b.mutedColor,
    ['--color-primary' as any]: b.primaryColor,
    ['--color-accent' as any]: b.accentColor,
    ['--font-sans' as any]: b.fontFamily,
    ['--radius-card' as any]: `${b.cardRadius}px`,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await prisma.branding.findUnique({ where: { id: 1 } }).catch(() => null);
  return (
    <html lang="en" style={brandingStyle(branding)}>
      <body>{children}</body>
    </html>
  );
}
