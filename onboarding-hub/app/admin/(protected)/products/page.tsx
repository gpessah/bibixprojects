import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { Field } from '@/components/admin/Field';

function parseChart(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept either JSON array of {label,value} or simple "label:value,label:value" pairs.
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return JSON.stringify(parsed);
  } catch {
    // ignore
  }
  const pairs = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [label, value] = p.split(':').map((s) => s.trim());
      const n = Number(value);
      if (!label || Number.isNaN(n)) return null;
      return { label, value: n };
    })
    .filter((x): x is { label: string; value: number } => !!x);
  return pairs.length > 0 ? JSON.stringify(pairs) : null;
}

async function add(formData: FormData) {
  'use server';
  await requireAdmin();
  const last = await prisma.product.findFirst({ orderBy: { order: 'desc' } });
  await prisma.product.create({
    data: {
      name: String(formData.get('name') ?? '').trim() || 'New product',
      description: String(formData.get('description') ?? '').trim() || null,
      imageUrl: String(formData.get('imageUrl') ?? '').trim() || null,
      linkUrl: String(formData.get('linkUrl') ?? '').trim() || null,
      chartLabel: String(formData.get('chartLabel') ?? '').trim() || null,
      chartData: parseChart(String(formData.get('chartData') ?? '')),
      order: (last?.order ?? -1) + 1,
    },
  });
  revalidatePath('/');
  redirect('/admin/products');
}

async function update(formData: FormData) {
  'use server';
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.product.update({
    where: { id },
    data: {
      name: String(formData.get('name') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || null,
      imageUrl: String(formData.get('imageUrl') ?? '').trim() || null,
      linkUrl: String(formData.get('linkUrl') ?? '').trim() || null,
      chartLabel: String(formData.get('chartLabel') ?? '').trim() || null,
      chartData: parseChart(String(formData.get('chartData') ?? '')),
      order: Number(formData.get('order') ?? 0),
    },
  });
  revalidatePath('/');
  redirect('/admin/products');
}

async function remove(formData: FormData) {
  'use server';
  await requireAdmin();
  await prisma.product.delete({ where: { id: String(formData.get('id') ?? '') } });
  revalidatePath('/');
  redirect('/admin/products');
}

export default async function ProductsAdmin() {
  const products = await prisma.product.findMany({ orderBy: { order: 'asc' } });

  return (
    <>
      <h1 className="text-3xl font-semibold">Products</h1>
      <p className="text-muted mt-2">
        Each product shows a description and an optional line chart on the products page.
      </p>

      <div className="mt-8 space-y-4">
        {products.map((p) => (
          <form key={p.id} action={update} className="card p-5 space-y-4">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Name">
                <input name="name" defaultValue={p.name} className="input" />
              </Field>
              <Field label="Link URL">
                <input name="linkUrl" defaultValue={p.linkUrl ?? ''} className="input" />
              </Field>
              <Field label="Order">
                <input type="number" name="order" defaultValue={p.order} className="input" />
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" defaultValue={p.description ?? ''} className="textarea" />
            </Field>
            <Field label="Image URL">
              <input name="imageUrl" defaultValue={p.imageUrl ?? ''} className="input" />
            </Field>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Chart label">
                <input name="chartLabel" defaultValue={p.chartLabel ?? ''} className="input" />
              </Field>
              <Field
                label="Chart data"
                hint='JSON array OR "Jan:10,Feb:20,Mar:35"'
              >
                <input
                  name="chartData"
                  defaultValue={p.chartData ?? ''}
                  className="input"
                  placeholder="Jan:10,Feb:20,Mar:35"
                />
              </Field>
            </div>
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

      <h2 className="text-xl font-semibold mt-12">Add product</h2>
      <form action={add} className="card p-5 mt-3 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Name">
            <input name="name" required className="input" />
          </Field>
          <Field label="Link URL">
            <input name="linkUrl" className="input" />
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" className="textarea" rows={2} />
        </Field>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Chart label">
            <input name="chartLabel" className="input" />
          </Field>
          <Field label="Chart data" hint='e.g. "Jan:10,Feb:20,Mar:35"'>
            <input name="chartData" className="input" />
          </Field>
        </div>
        <Field label="Image URL">
          <input name="imageUrl" className="input" />
        </Field>
        <button className="btn" type="submit">
          Add product
        </button>
      </form>
    </>
  );
}
