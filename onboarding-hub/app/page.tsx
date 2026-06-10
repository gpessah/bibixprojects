import { prisma } from '@/lib/db';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { SectionCard } from '@/components/SectionCard';
import { ProgressCard } from '@/components/ProgressCard';
import { AskAnythingCard } from '@/components/AskAnythingCard';

export default async function HomePage() {
  const [branding, welcome, sections, firstMilestone] = await Promise.all([
    prisma.branding.findUnique({ where: { id: 1 } }),
    prisma.welcome.findUnique({ where: { id: 1 } }),
    prisma.section.findMany({
      where: { enabled: true },
      orderBy: { order: 'asc' },
      include: { items: { orderBy: { order: 'asc' } } },
    }),
    prisma.planMilestone.findFirst({
      orderBy: { order: 'asc' },
      include: { tasks: true },
    }),
  ]);

  const requiredTasks = firstMilestone?.tasks.filter((t) => t.required) ?? [];

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto pb-20">
        <Hero
          title={welcome?.title ?? 'Welcome'}
          message={welcome?.message ?? ''}
          videoUrl={welcome?.videoUrl}
          heroImageUrl={welcome?.heroImageUrl}
          ctaLabel={welcome?.ctaLabel ?? 'Get started'}
          ctaUrl={welcome?.ctaUrl}
        />

        <section className="px-6 md:px-10">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {sections.map((s) => (
              <SectionCard
                key={s.id}
                sectionKey={s.key}
                title={s.title}
                icon={s.icon}
                items={s.items}
              />
            ))}
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-5">
            <ProgressCard
              title={firstMilestone?.title ?? 'First Week'}
              subtitle="Your required setup tasks"
              done={0}
              total={requiredTasks.length}
              href="/section/plan"
            />
            <AskAnythingCard companyName={branding?.companyName ?? 'us'} />
          </div>
        </section>
      </main>
    </>
  );
}
