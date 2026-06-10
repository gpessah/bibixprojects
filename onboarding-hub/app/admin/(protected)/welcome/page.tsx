import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { Field, FormStatus } from '@/components/admin/Field';

async function save(formData: FormData) {
  'use server';
  await requireAdmin();
  const data = {
    title: String(formData.get('title') ?? '').trim() || 'Welcome',
    message: String(formData.get('message') ?? '').trim(),
    videoUrl: String(formData.get('videoUrl') ?? '').trim() || null,
    heroImageUrl: String(formData.get('heroImageUrl') ?? '').trim() || null,
    ctaLabel: String(formData.get('ctaLabel') ?? '').trim() || 'Get started',
    ctaUrl: String(formData.get('ctaUrl') ?? '').trim() || null,
  };
  await prisma.welcome.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  revalidatePath('/');
  redirect('/admin/welcome?saved=1');
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const w = (await prisma.welcome.findUnique({ where: { id: 1 } })) ?? {
    title: '',
    message: '',
    videoUrl: '',
    heroImageUrl: '',
    ctaLabel: 'Get started',
    ctaUrl: '',
  };

  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome / hero</h1>
      <p className="text-muted mt-2">The first thing new joiners see.</p>

      <form action={save} className="mt-8 space-y-5">
        {searchParams.saved && <FormStatus saved />}
        <Field label="Title">
          <input name="title" defaultValue={w.title ?? ''} className="input" />
        </Field>
        <Field label="Message" hint="A warm welcome. Plain text or short paragraphs.">
          <textarea name="message" defaultValue={w.message ?? ''} className="textarea" rows={5} />
        </Field>
        <div className="grid md:grid-cols-2 gap-5">
          <Field
            label="Welcome video URL"
            hint="YouTube, Vimeo, or any embeddable URL. Leave blank to skip."
          >
            <input
              name="videoUrl"
              defaultValue={w.videoUrl ?? ''}
              className="input"
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </Field>
          <Field label="Hero image URL (used if no video)">
            <input name="heroImageUrl" defaultValue={w.heroImageUrl ?? ''} className="input" />
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="CTA label">
            <input name="ctaLabel" defaultValue={w.ctaLabel ?? ''} className="input" />
          </Field>
          <Field label="CTA URL" hint="Use /section/first-week for internal links.">
            <input name="ctaUrl" defaultValue={w.ctaUrl ?? ''} className="input" />
          </Field>
        </div>
        <button type="submit" className="btn">
          Save changes
        </button>
      </form>
    </>
  );
}
