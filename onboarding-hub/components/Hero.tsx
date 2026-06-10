import Link from 'next/link';

function toEmbed(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      return url;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return url;
  } catch {
    return null;
  }
}

export function Hero({
  title,
  message,
  videoUrl,
  heroImageUrl,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  message: string;
  videoUrl?: string | null;
  heroImageUrl?: string | null;
  ctaLabel: string;
  ctaUrl?: string | null;
}) {
  const embed = toEmbed(videoUrl);
  return (
    <section className="px-6 md:px-10 py-10 md:py-14 grid md:grid-cols-2 gap-8 items-center">
      <div>
        <span className="chip">Welcome</span>
        <h1 className="mt-4 text-4xl md:text-5xl font-semibold leading-tight">{title}</h1>
        <p className="mt-4 text-muted text-lg max-w-prose">{message}</p>
        {ctaUrl && (
          <Link href={ctaUrl} className="btn mt-6">
            {ctaLabel}
          </Link>
        )}
      </div>
      <div className="card overflow-hidden aspect-video">
        {embed ? (
          <iframe
            src={embed}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted">
            Add a welcome video in the admin →
          </div>
        )}
      </div>
    </section>
  );
}
