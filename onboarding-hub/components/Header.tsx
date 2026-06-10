import Link from 'next/link';
import { prisma } from '@/lib/db';

export async function Header() {
  const b = await prisma.branding.findUnique({ where: { id: 1 } }).catch(() => null);
  return (
    <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-border">
      <Link href="/" className="flex items-center gap-3">
        {b?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt={b.companyName} className="h-8 w-auto" />
        ) : (
          <div
            className="h-8 w-8 rounded-md grid place-items-center text-white font-semibold"
            style={{ background: 'var(--color-primary)' }}
          >
            {(b?.companyName ?? 'A').slice(0, 1)}
          </div>
        )}
        <div className="leading-tight">
          <div className="font-semibold">{b?.companyName ?? 'Acme'}</div>
          <div className="text-xs text-muted">{b?.tagline ?? 'Welcome aboard'}</div>
        </div>
      </Link>
      <nav className="flex items-center gap-2 text-sm">
        <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-surface">
          Hub
        </Link>
        <Link href="/admin" className="btn-ghost btn">
          Admin
        </Link>
      </nav>
    </header>
  );
}
