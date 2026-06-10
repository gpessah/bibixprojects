import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Header } from '@/components/Header';
import { Icon } from '@/lib/icon';
import { ProductChart } from '@/components/ProductChart';

// Reserved keys that render specialized layouts (not driven by Section table).
const SPECIAL = new Set(['plan', 'products', 'team', 'values']);

export default async function SectionPage({ params }: { params: { key: string } }) {
  const key = params.key;
  if (SPECIAL.has(key)) {
    return <SpecialSection k={key} />;
  }

  const section = await prisma.section.findUnique({
    where: { key },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  if (!section) notFound();

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-6 md:px-10 py-10">
        <Link href="/" className="text-muted text-sm hover:text-text">
          ← Back to hub
        </Link>
        <div className="mt-6 flex items-center gap-4">
          <div
            className="h-12 w-12 rounded-card grid place-items-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <Icon name={section.icon} className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-semibold">{section.title}</h1>
        </div>

        <div className="mt-10 grid gap-4">
          {section.items.map((it) => (
            <article key={it.id} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{it.title}</h2>
                  {it.body && (
                    <p className="mt-2 text-muted whitespace-pre-wrap leading-relaxed">{it.body}</p>
                  )}
                </div>
                {it.linkUrl && (
                  <Link
                    href={it.linkUrl}
                    target={it.linkUrl.startsWith('http') ? '_blank' : undefined}
                    className="btn-ghost btn whitespace-nowrap"
                  >
                    Open
                  </Link>
                )}
              </div>
            </article>
          ))}
          {section.items.length === 0 && (
            <p className="text-muted">No items yet. Add some in the admin panel.</p>
          )}
        </div>
      </main>
    </>
  );
}

async function SpecialSection({ k }: { k: string }) {
  if (k === 'plan') return <PlanView />;
  if (k === 'products') return <ProductsView />;
  if (k === 'team') return <TeamView />;
  if (k === 'values') return <ValuesView />;
  notFound();
}

async function PlanView() {
  const milestones = await prisma.planMilestone.findMany({
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-6 md:px-10 py-10">
        <Link href="/" className="text-muted text-sm hover:text-text">
          ← Back to hub
        </Link>
        <h1 className="text-4xl font-semibold mt-6">Your 90-Day Plan</h1>
        <p className="text-muted mt-2">A roadmap from day one through your first quarter.</p>

        <ol className="mt-10 relative border-l border-border pl-6 space-y-8">
          {milestones.map((m) => (
            <li key={m.id} className="relative">
              <span
                className="absolute -left-[33px] top-1.5 h-3 w-3 rounded-full"
                style={{ background: 'var(--color-primary)' }}
              />
              <div className="flex items-baseline gap-3">
                <span className="chip">{m.dayRange}</span>
                <h2 className="text-2xl font-semibold">{m.title}</h2>
              </div>
              {m.description && <p className="text-muted mt-2">{m.description}</p>}
              <ul className="mt-4 space-y-2">
                {m.tasks.map((t) => (
                  <li key={t.id} className="card p-4 flex items-start gap-3">
                    <span
                      className="mt-1 h-4 w-4 rounded border border-border"
                      style={{ background: t.required ? 'var(--color-primary)' : 'transparent' }}
                    />
                    <div>
                      <div className="font-medium">
                        {t.title}{' '}
                        {t.required && <span className="chip ml-2">Required</span>}
                      </div>
                      {t.description && (
                        <p className="text-sm text-muted mt-1">{t.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}

async function ProductsView() {
  const products = await prisma.product.findMany({ orderBy: { order: 'asc' } });
  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <Link href="/" className="text-muted text-sm hover:text-text">
          ← Back to hub
        </Link>
        <h1 className="text-4xl font-semibold mt-6">Our Products & Platform</h1>

        <div className="mt-10 grid md:grid-cols-2 gap-6">
          {products.map((p) => {
            let data: { label: string; value: number }[] = [];
            try {
              data = p.chartData ? JSON.parse(p.chartData) : [];
            } catch {
              data = [];
            }
            return (
              <article key={p.id} className="card p-6">
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="rounded-md w-full h-32 object-cover mb-4" />
                )}
                <h2 className="text-xl font-semibold">{p.name}</h2>
                {p.description && <p className="text-muted mt-2 text-sm">{p.description}</p>}
                {data.length > 0 && (
                  <div className="mt-4">
                    <ProductChart data={data} label={p.chartLabel} />
                  </div>
                )}
                {p.linkUrl && (
                  <Link
                    href={p.linkUrl}
                    target="_blank"
                    className="btn mt-4 w-fit"
                  >
                    Open platform
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}

async function TeamView() {
  const team = await prisma.teamMember.findMany({ orderBy: { order: 'asc' } });
  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <Link href="/" className="text-muted text-sm hover:text-text">
          ← Back to hub
        </Link>
        <h1 className="text-4xl font-semibold mt-6">Meet the team</h1>

        <div className="mt-10 grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {team.map((m) => (
            <article key={m.id} className="card p-5 text-center">
              {m.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.photoUrl}
                  alt={m.name}
                  className="w-24 h-24 rounded-full mx-auto object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full mx-auto bg-surface border border-border grid place-items-center">
                  <span className="text-xl">{m.name.slice(0, 1)}</span>
                </div>
              )}
              <h3 className="font-semibold mt-4">{m.name}</h3>
              {m.role && <p className="text-xs text-muted uppercase tracking-wider">{m.role}</p>}
              {m.bio && <p className="text-sm text-muted mt-3">{m.bio}</p>}
            </article>
          ))}
        </div>
      </main>
    </>
  );
}

async function ValuesView() {
  const values = await prisma.value.findMany({ orderBy: { order: 'asc' } });
  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <Link href="/" className="text-muted text-sm hover:text-text">
          ← Back to hub
        </Link>
        <h1 className="text-4xl font-semibold mt-6">What we value</h1>

        <div className="mt-10 grid md:grid-cols-2 gap-5">
          {values.map((v) => (
            <article key={v.id} className="card p-6">
              <div className="flex items-start gap-4">
                <div
                  className="h-10 w-10 rounded-card grid place-items-center"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <Icon name={v.icon} className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{v.title}</h3>
                  {v.description && <p className="text-muted mt-1">{v.description}</p>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
