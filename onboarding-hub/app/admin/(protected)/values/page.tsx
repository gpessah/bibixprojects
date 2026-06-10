import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { ICON_CHOICES } from '@/lib/icon';
import { Field } from '@/components/admin/Field';

async function add(formData: FormData) {
  'use server';
  await requireAdmin();
  const last = await prisma.value.findFirst({ orderBy: { order: 'desc' } });
  await prisma.value.create({
    data: {
      title: String(formData.get('title') ?? '').trim() || 'New value',
      description: String(formData.get('description') ?? '').trim() || null,
      icon: String(formData.get('icon') ?? 'Sparkles'),
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath('/');
  redirect('/admin/values');
}

async function update(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.value.update({
    where: { id },
    data: {
      title: String(formData.get('title') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || null,
      icon: String(formData.get('icon') ?? 'Sparkles'),
      order: Number(formData.get('order') ?? 0),
    },
  });
  revalidatePath('/');
  redirect('/admin/values');
}

async function remove(formData: FormData) {
  'use server';
  await requireAdmin();
  await prisma.value.delete({ where: { id: String(formData.get('id') ?? '') } });
  revalidatePath('/');
  redirect('/admin/values');
}

export default async function ValuesAdmin() {
  const values = await prisma.value.findMany({ orderBy: { order: 'asc' } });
  return (
    <>
      <h1 className="text-3xl font-semibold">Values</h1>
      <p className="text-muted mt-2">The principles that guide how the team works.</p>

      <div className="mt-8 space-y-4">
        {values.map((v) => (
          <form key={v.id} action={update} className="card p-5 space-y-4">
            <input type="hidden" name="id" value={v.id} />
            <div className="grid md:grid-cols-4 gap-4">
              <Field label="Title">
                <input name="title" defaultValue={v.title} className="input" />
              </Field>
              <Field label="Icon">
                <select name="icon" defaultValue={v.icon} className="select">
                  {ICON_CHOICES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Order">
                <input type="number" name="order" defaultValue={v.order} className="input" />
              </Field>
              <div className="flex items-end gap-2">
                <button className="btn" type="submit">
                  Save
                </button>
                <button
                  className="btn-ghost btn"
                  type="submit"
                  formAction={remove}
                  formNoValidate
                >
                  Delete
                </button>
              </div>
            </div>
            <Field label="Description">
              <textarea
                name="description"
                defaultValue={v.description ?? ''}
                className="textarea"
                rows={2}
              />
            </Field>
          </form>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-12">Add value</h2>
      <form action={add} className="card p-5 mt-3 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Title">
            <input name="title" required className="input" />
          </Field>
          <Field label="Icon">
            <select name="icon" defaultValue="Sparkles" className="select">
              {ICON_CHOICES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" className="textarea" rows={2} />
        </Field>
        <button className="btn" type="submit">
          Add value
        </button>
      </form>
    </>
  );
}
