import Link from 'next/link';
import { redirect } from 'next/navigation';
import { destroySession, getSession } from '@/lib/auth';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/branding', label: 'Branding & theme' },
  { href: '/admin/welcome', label: 'Welcome / hero' },
  { href: '/admin/sections', label: 'Hub sections' },
  { href: '/admin/plan', label: '90-day plan' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/values', label: 'Values' },
];

async function logoutAction() {
  'use server';
  destroySession();
  redirect('/admin/login');
}

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/admin/login');

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-border p-5 space-y-1 sticky top-0 h-screen overflow-y-auto">
        <Link href="/" className="block mb-6 text-sm text-muted hover:text-text">
          ← View hub
        </Link>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">Admin</div>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="block px-3 py-2 rounded-md text-sm hover:bg-surface"
          >
            {n.label}
          </Link>
        ))}
        <form action={logoutAction} className="mt-8">
          <div className="text-xs text-muted mb-2">{session.email}</div>
          <button type="submit" className="btn-ghost btn w-full justify-center text-sm">
            Sign out
          </button>
        </form>
      </aside>
      <div className="p-8 md:p-10 max-w-4xl">{children}</div>
    </div>
  );
}
