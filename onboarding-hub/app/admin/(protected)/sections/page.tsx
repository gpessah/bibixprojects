import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ICON_CHOICES } from '@/lib/icon';
import { Field } from '@/components/admin/Field';

async function createSection(formData: FormData) {
  'use server';
  await requireAdmin();
  const key = String(formData.get('key') ?? '').trim().toLowerCase();
  const title = String(formData.get('title') ?? '').trim();
  if (!key || !title) redirect('/admin/sections');
  const last = await prisma.section.findFirst({ orderBy: { order: 'desc' } });
  await prisma.section.create({
    data: { key, title, icon: 'Sparkles', order: (last?.order ?? -1) + 1 },
  });
  revalidatePath('/');
  redirect('/admin/sections');
}

async function deleteSection(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.section.delete({ where: { id } });
  revalidatePath('/');
  redirect('/admin/sections');
}

export default async function SectionsPage() {
  const sections = await prisma.section.findMany({
    orderBy: { order: 'asc' },
    include: { _count: { select: { items: true } } },
  });

  return (
    <>
      <h1 className="text-3xl font-semibold">Hub sections</h1>
      <p className="text-muted mt-2">
        The cards that appear on the hub homepage. Click one to edit its title, icon, and items.
      </p>

      <div className="mt-8 space-y-3">
        {sections.map((s) => (
          <div key={s.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-muted mt-1">
                key: {s.key} · {s._count.items} items · {s.enabled ? 'visible' : 'hidden'}
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/sections/${s.id}`} className="btn-ghost btn text-sm">
                Edit
              </Link>
              <form action={deleteSection}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn-ghost btn text-sm" type="submit">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-12">Add a section</h2>
      <form action={createSection} className="card p-5 mt-4 grid md:grid-cols-3 gap-4 items-end">
        <Field label="Key (URL slug)" hint="e.g. compliance">
          <input name="key" required className="input" placeholder="my-section" />
        </Field>
        <Field label="Title">
          <input name="title" required className="input" placeholder="My Section" />
        </Field>
        <button className="btn" type="submit">
          Add section
        </button>
      </form>

      <p className="text-xs text-muted mt-3">
        Available icons:{' '}
        {ICON_CHOICES.slice(0, 8).join(', ')}… (pick when editing a section)
      </p>
    </>
  );
}
