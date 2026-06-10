import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { Field } from '@/components/admin/Field';

async function addMilestone(formData: FormData) {
  'use server';
  await requireAdmin();
  const last = await prisma.planMilestone.findFirst({ orderBy: { order: 'desc' } });
  await prisma.planMilestone.create({
    data: {
      title: String(formData.get('title') ?? '').trim() || 'New milestone',
      dayRange: String(formData.get('dayRange') ?? '').trim() || 'Day 1-7',
      description: String(formData.get('description') ?? '').trim() || null,
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath('/');
  redirect('/admin/plan');
}

async function updateMilestone(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.planMilestone.update({
    where: { id },
    data: {
      title: String(formData.get('title') ?? '').trim(),
      dayRange: String(formData.get('dayRange') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || null,
      order: Number(formData.get('order') ?? 0),
    },
  });
  revalidatePath('/');
  redirect('/admin/plan');
}

async function deleteMilestone(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.planMilestone.delete({ where: { id } });
  revalidatePath('/');
  redirect('/admin/plan');
}

async function addTask(formData: FormData) {
  'use server';
  await requireAdmin();
  const milestoneId = String(formData.get('milestoneId') ?? '');
  const last = await prisma.planTask.findFirst({
    where: { milestoneId },
    orderBy: { order: 'desc' },
  });
  await prisma.planTask.create({
    data: {
      milestoneId,
      title: String(formData.get('title') ?? '').trim() || 'New task',
      description: String(formData.get('description') ?? '').trim() || null,
      required: formData.get('required') === 'on',
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath('/');
  redirect('/admin/plan');
}

async function deleteTask(formData: FormData) {
  'use server';
  await requireAdmin();
  await prisma.planTask.delete({ where: { id: String(formData.get('id') ?? '') } });
  revalidatePath('/');
  redirect('/admin/plan');
}

export default async function PlanAdmin() {
  const milestones = await prisma.planMilestone.findMany({
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });

  return (
    <>
      <h1 className="text-3xl font-semibold">90-day plan</h1>
      <p className="text-muted mt-2">Milestones and tasks across the first quarter.</p>

      <div className="mt-8 space-y-6">
        {milestones.map((m) => (
          <div key={m.id} className="card p-5">
            <form action={updateMilestone} className="space-y-4">
              <input type="hidden" name="id" value={m.id} />
              <div className="grid md:grid-cols-4 gap-4">
                <Field label="Title">
                  <input name="title" defaultValue={m.title} className="input" />
                </Field>
                <Field label="Day range">
                  <input name="dayRange" defaultValue={m.dayRange} className="input" />
                </Field>
                <Field label="Order">
                  <input type="number" name="order" defaultValue={m.order} className="input" />
                </Field>
                <div className="flex items-end gap-2">
                  <button className="btn" type="submit">
                    Save
                  </button>
                  <button
                    className="btn-ghost btn"
                    type="submit"
                    formAction={deleteMilestone}
                    formNoValidate
                  >
                    Delete
                  </button>
                </div>
              </div>
              <Field label="Description">
                <textarea
                  name="description"
                  defaultValue={m.description ?? ''}
                  className="textarea"
                  rows={2}
                />
              </Field>
            </form>

            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-muted mb-2">Tasks</div>
              <ul className="space-y-2">
                {m.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {t.required && <span className="chip mr-2">Required</span>}
                      {t.title}
                    </span>
                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="text-xs text-muted hover:text-text">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>

              <form action={addTask} className="mt-4 grid md:grid-cols-[1fr_2fr_auto_auto] gap-3 items-end">
                <input type="hidden" name="milestoneId" value={m.id} />
                <Field label="New task title">
                  <input name="title" required className="input" />
                </Field>
                <Field label="Description (optional)">
                  <input name="description" className="input" />
                </Field>
                <label className="flex items-center gap-2 text-sm pb-3">
                  <input type="checkbox" name="required" />
                  Required
                </label>
                <button className="btn" type="submit">
                  Add task
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-semibold mt-12">Add milestone</h2>
      <form action={addMilestone} className="card p-5 mt-3 grid md:grid-cols-[1fr_1fr_2fr_auto] gap-4 items-end">
        <Field label="Title">
          <input name="title" required className="input" />
        </Field>
        <Field label="Day range">
          <input name="dayRange" required className="input" placeholder="Day 1-7" />
        </Field>
        <Field label="Description">
          <input name="description" className="input" />
        </Field>
        <button className="btn" type="submit">
          Add milestone
        </button>
      </form>
    </>
  );
}
