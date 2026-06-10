import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { Field, FormStatus } from '@/components/admin/Field';

async function save(formData: FormData) {
  'use server';
  await requireAdmin();
  const data = {
    companyName: String(formData.get('companyName') ?? '').trim() || 'Acme',
    tagline: String(formData.get('tagline') ?? '').trim(),
    logoUrl: String(formData.get('logoUrl') ?? '').trim() || null,
    faviconUrl: String(formData.get('faviconUrl') ?? '').trim() || null,
    bgColor: String(formData.get('bgColor') ?? '#000000'),
    surfaceColor: String(formData.get('surfaceColor') ?? '#0b0b0b'),
    borderColor: String(formData.get('borderColor') ?? '#1f1f1f'),
    textColor: String(formData.get('textColor') ?? '#ffffff'),
    mutedColor: String(formData.get('mutedColor') ?? '#8a8a8a'),
    primaryColor: String(formData.get('primaryColor') ?? '#6366f1'),
    accentColor: String(formData.get('accentColor') ?? '#22d3ee'),
    fontFamily: String(formData.get('fontFamily') ?? '').trim() || 'ui-sans-serif, system-ui, sans-serif',
    cardRadius: Number(formData.get('cardRadius') ?? 18),
  };
  await prisma.branding.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  revalidatePath('/', 'layout');
  redirect('/admin/branding?saved=1');
}

export default async function BrandingPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const b = (await prisma.branding.findUnique({ where: { id: 1 } })) ?? {
    companyName: 'Acme',
    tagline: '',
    logoUrl: '',
    faviconUrl: '',
    bgColor: '#000000',
    surfaceColor: '#0b0b0b',
    borderColor: '#1f1f1f',
    textColor: '#ffffff',
    mutedColor: '#8a8a8a',
    primaryColor: '#6366f1',
    accentColor: '#22d3ee',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    cardRadius: 18,
  };

  const colorFields: { name: keyof typeof b; label: string }[] = [
    { name: 'primaryColor', label: 'Primary' },
    { name: 'accentColor', label: 'Accent' },
    { name: 'bgColor', label: 'Background' },
    { name: 'surfaceColor', label: 'Surface (cards)' },
    { name: 'borderColor', label: 'Border' },
    { name: 'textColor', label: 'Text' },
    { name: 'mutedColor', label: 'Muted text' },
  ];

  return (
    <>
      <h1 className="text-3xl font-semibold">Branding & theme</h1>
      <p className="text-muted mt-2">
        Logo, colors, fonts — all changes apply instantly to the hub.
      </p>

      <form action={save} className="mt-8 space-y-6">
        {searchParams.saved && <FormStatus saved />}

        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Company name">
            <input name="companyName" defaultValue={b.companyName ?? ''} className="input" />
          </Field>
          <Field label="Tagline">
            <input name="tagline" defaultValue={b.tagline ?? ''} className="input" />
          </Field>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Logo URL" hint="Paste a URL to your logo (SVG or PNG with transparency works best).">
            <input name="logoUrl" defaultValue={b.logoUrl ?? ''} className="input" placeholder="https://…/logo.svg" />
          </Field>
          <Field label="Favicon URL">
            <input name="faviconUrl" defaultValue={b.faviconUrl ?? ''} className="input" />
          </Field>
        </div>

        <div>
          <div className="label">Colors</div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {colorFields.map((f) => (
              <div key={f.name} className="card p-3">
                <div className="text-xs text-muted">{f.label}</div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    name={f.name as string}
                    defaultValue={(b as any)[f.name]}
                    className="h-9 w-12 bg-transparent border border-border rounded"
                  />
                  <input
                    name={`${String(f.name)}_text`}
                    defaultValue={(b as any)[f.name]}
                    readOnly
                    className="input text-xs"
                    aria-label={`${f.label} hex`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Font family (CSS)" hint='e.g. "Inter", system-ui, sans-serif'>
            <input name="fontFamily" defaultValue={b.fontFamily ?? ''} className="input" />
          </Field>
          <Field label="Card corner radius (px)">
            <input
              type="number"
              min={0}
              max={40}
              name="cardRadius"
              defaultValue={b.cardRadius ?? 18}
              className="input"
            />
          </Field>
        </div>

        <button type="submit" className="btn">
          Save changes
        </button>
      </form>
    </>
  );
}
