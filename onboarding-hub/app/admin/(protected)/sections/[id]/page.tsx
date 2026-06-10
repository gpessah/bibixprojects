import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ICON_CHOICES } from '@/lib/icon';
import { Field, FormStatus } from '@/components/admin/Field';

async function saveSection(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.section.update({
    where: { id },
    data: {
      title: String(formData.get('title') ?? '').trim(),
      key: String(formData.get('key') ?? '').trim().toLowerCase(),
      icon: String(formData.get('icon') ?? 'Sparkles'),
      enabled: formData.get('enabled') === 'on',
      order: Number(formData.get('order') ?? 0),
    },
  });
  revalidatePath('/');
  redirect(`/admin/sections/${id}?saved=1`);
}

async function addItem(formData: FormData) {
  'use server';
  await requireAdmin();
  const sectionId = String(formData.get('sectionId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (!title) redirect(`/admin/sections/${sectionId}`);
  const last = await prisma.sectionItem.findFirst({
    where: { sectionId },
    orderBy: { order: 'desc' },
  });
  await prisma.sectionItem.create({
    data: {
      sectionId,
      title,
      body: String(formData.get('body') ?? '').trim() || null,
      linkUrl: String(formData.get('linkUrl') ?? '').trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath('/');
  redirect(`/admin/sections/${sectionId}`);
}

async function updateItem(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const sectionId = String(formData.get('sectionId') ?? '');
  await prisma.sectionItem.update({
    where: { id },
    data: {
      title: String(formData.get('title') ?? '').trim(),
      body: String(formData.get('body') ?? '').trim() || null,
      linkUrl: String(formData.get('linkUrl') ?? '').trim() || null,
    },
  });
  revalidatePath('/');
  redirect(`/admin/sections/${sectionId}`);
}

async function deleteItem(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const sectionId = String(formData.get('sectionId') ?? '');
  await prisma.sectionItem.delete({ where: { id } });
  revalidatePath('/');
  redirect(`/admin/sections/${sectionId}`);
}

export default async function SectionDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const section = await prisma.section.findUnique({
    where: { id: params.id },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  if (!section) notFound();

  return (
    <>
      <Link href="/admin/sections" className="text-muted text-sm hover:text-text">
        ← Sections
      </Link>
      <h1 className="text-3xl font-semibold mt-4">{section.title}</h1>

      <form action={saveSection} className="mt-8 space-y-5">
        {searchParams.saved && <FormStatus saved />}
        <input type="hidden" name="id" value={section.id} />
        <div className="grid md:grid-cols-3 gap-5">
          <Field label="Title">
            <input name="title" defaultValue={section.title} className="input" />
          </Field>
          <Field label="Key (slug)">
            <input name="key" defaultValue={section.key} className="input" />
          </Field>
          <Field label="Order">
            <input type="number" name="order" defaultValue={section.order} className="input" />
          </Field>
        </div>
        <Field label="Icon">
          <select name="icon" defaultValue={section.icon} className="select">
            {ICON_CHOICES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={section.enabled} />
          Visible on the hub
        </label>
        <button type="submit" className="btn">
          Save section
        </button>
      </form>

      <h2 className="text-xl font-semibold mt-12">Items</h2>
      <p className="text-muted text-sm">Sub-bullets shown under this card.</p>

      <div className="mt-4 space-y-3">
        {section.items.map((it) => (
          <form key={it.id} action={updateItem} className="card p-4 space-y-3">
            <input type="hidden" name="id" value={it.id} />
            <input type="hidden" name="sectionId" value={section.id} />
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Title">
                <input name="title" defaultValue={it.title} className="input" />
              </Field>
              <Field label="Link URL (optional)">
                <input name="linkUrl" defaultValue={it.linkUrl ?? ''} className="input" />
              </Field>
            </div>
            <Field label="Body">
              <textarea name="body" defaultValue={it.body ?? ''} className="textarea" rows={3} />
            </Field>
            <div className="flex justify-between">
              <button className="btn" type="submit">
                Save
              </button>
              <button
                className="btn-ghost btn"
                type="submit"
                formAction={deleteItem}
                formNoValidate
              >
                Delete
              </button>
            </div>
          </form>
        ))}
      </div>

      <h3 className="text-lg font-semibold mt-10">Add item</h3>
      <form action={addItem} className="card p-4 mt-3 space-y-3">
        <input type="hidden" name="sectionId" value={section.id} />
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Title">
            <input name="title" required className="input" />
          </Field>
          <Field label="Link URL (optional)">
            <input name="linkUrl" className="input" />
          </Field>
        </div>
        <Field label="Body">
          <textarea name="body" className="textarea" rows={3} />
        </Field>
        <button className="btn" type="submit">
          Add item
        </button>
      </form>
    </>
  );
}
