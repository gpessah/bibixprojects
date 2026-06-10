import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { Field } from '@/components/admin/Field';

async function add(formData: FormData) {
  'use server';
  await requireAdmin();
  const last = await prisma.teamMember.findFirst({ orderBy: { order: 'desc' } });
  await prisma.teamMember.create({
    data: {
      name: String(formData.get('name') ?? '').trim() || 'New member',
      role: String(formData.get('role') ?? '').trim() || null,
      photoUrl: String(formData.get('photoUrl') ?? '').trim() || null,
      bio: String(formData.get('bio') ?? '').trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath('/');
  redirect('/admin/team');
}

async function update(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.teamMember.update({
    where: { id },
    data: {
      name: String(formData.get('name') ?? '').trim(),
      role: String(formData.get('role') ?? '').trim() || null,
      photoUrl: String(formData.get('photoUrl') ?? '').trim() || null,
      bio: String(formData.get('bio') ?? '').trim() || null,
      order: Number(formData.get('order') ?? 0),
    },
  });
  revalidatePath('/');
  redirect('/admin/team');
}

async function remove(formData: FormData) {
  'use server';
  await requireAdmin();
  await prisma.teamMember.delete({ where: { id: String(formData.get('id') ?? '') } });
  revalidatePath('/');
  redirect('/admin/team');
}

export default async function TeamAdmin() {
  const team = await prisma.teamMember.findMany({ orderBy: { order: 'asc' } });
  return (
    <>
      <h1 className="text-3xl font-semibold">Team</h1>
      <p className="text-muted mt-2">Photos and intros for the people new joiners meet.</p>

      <div className="mt-8 space-y-4">
        {team.map((m) => (
          <form key={m.id} action={update} className="card p-5 space-y-4">
            <input type="hidden" name="id" value={m.id} />
            <div className="grid md:grid-cols-4 gap-4">
              <Field label="Name">
                <input name="name" defaultValue={m.name} className="input" />
              </Field>
              <Field label="Role">
                <input name="role" defaultValue={m.role ?? ''} className="input" />
              </Field>
              <Field label="Photo URL">
                <input name="photoUrl" defaultValue={m.photoUrl ?? ''} className="input" />
              </Field>
              <Field label="Order">
                <input type="number" name="order" defaultValue={m.order} className="input" />
              </Field>
            </div>
            <Field label="Bio">
              <textarea name="bio" defaultValue={m.bio ?? ''} className="textarea" rows={2} />
            </Field>
            <div className="flex justify-between">
              <button className="btn" type="submit">
                Save
              </button>
              <button className="btn-ghost btn" type="submit" formAction={remove} formNoValidate>
                Delete
              </button>
            </div>
          </form>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-12">Add team member</h2>
      <form action={add} className="card p-5 mt-3 space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Name">
            <input name="name" required className="input" />
          </Field>
          <Field label="Role">
            <input name="role" className="input" />
          </Field>
          <Field label="Photo URL">
            <input name="photoUrl" className="input" />
          </Field>
        </div>
        <Field label="Bio">
          <textarea name="bio" className="textarea" rows={2} />
        </Field>
        <button className="btn" type="submit">
          Add member
        </button>
      </form>
    </>
  );
}
