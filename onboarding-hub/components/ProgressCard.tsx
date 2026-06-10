import Link from 'next/link';

export function ProgressCard({
  title,
  subtitle,
  done,
  total,
  href,
}: {
  title: string;
  subtitle: string;
  done: number;
  total: number;
  href: string;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <Link href={href} className="card p-6 md:p-7 flex items-center justify-between gap-6 block">
      <div>
        <h3 className="text-2xl font-semibold">{title}</h3>
        <p className="text-muted mt-1 text-sm">{subtitle}</p>
        <div className="mt-4 h-1.5 w-56 max-w-full rounded-full bg-border overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${pct}%`, background: 'var(--color-primary)' }}
          />
        </div>
      </div>
      <div className="text-right">
        <div className="text-3xl font-semibold">
          {done}
          <span className="text-muted">/{total}</span>
        </div>
        <div className="text-[10px] tracking-widest text-muted uppercase">Required tasks</div>
      </div>
    </Link>
  );
}
