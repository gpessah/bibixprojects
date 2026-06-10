import Link from 'next/link';
import { Icon } from '@/lib/icon';

type Item = { title: string };

export function SectionCard({
  sectionKey,
  title,
  icon,
  items,
}: {
  sectionKey: string;
  title: string;
  icon: string;
  items: Item[];
}) {
  return (
    <Link href={`/section/${sectionKey}`} className="card p-6 md:p-7 block group">
      <div className="flex items-start justify-between">
        <Icon name={icon} className="h-6 w-6 text-text/80" strokeWidth={1.5} />
        <span className="text-xs text-muted group-hover:text-text transition-colors">Open →</span>
      </div>
      <div className="mt-10">
        <h3 className="text-2xl font-semibold">{title}</h3>
        <ul className="mt-4 space-y-2">
          {items.slice(0, 3).map((it, i) => (
            <li key={i} className="text-muted text-sm">
              {it.title}
            </li>
          ))}
        </ul>
      </div>
    </Link>
  );
}
