import Link from 'next/link';
import { prisma } from '@/lib/db';

export default async function AdminOverview() {
  const [sections, milestones, products, team, values] = await Promise.all([
    prisma.section.count(),
    prisma.planMilestone.count(),
    prisma.product.count(),
    prisma.teamMember.count(),
    prisma.value.count(),
  ]);

  const tiles = [
    { label: 'Hub sections', count: sections, href: '/admin/sections' },
    { label: 'Plan milestones', count: milestones, href: '/admin/plan' },
    { label: 'Products', count: products, href: '/admin/products' },
    { label: 'Team members', count: team, href: '/admin/team' },
    { label: 'Values', count: values, href: '/admin/values' },
  ];

  return (
    <>
      <h1 className="text-3xl font-semibold">Overview</h1>
      <p className="text-muted mt-2">
        Manage every piece of content on the hub. Start with{' '}
        <Link className="underline" href="/admin/branding">
          branding
        </Link>
        .
      </p>

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card p-5 block">
            <div className="text-xs uppercase tracking-widest text-muted">{t.label}</div>
            <div className="text-3xl font-semibold mt-2">{t.count}</div>
            <div className="text-sm text-muted mt-1">Manage →</div>
          </Link>
        ))}
      </div>
    </>
  );
}
