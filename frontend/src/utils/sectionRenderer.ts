export interface Theme {
  primaryColor: string;
  fontFamily?: string;
}

export type SectionType = 'hero' | 'features' | 'testimonials' | 'pricing' | 'cta' | 'contact' | 'footer';

export interface Section {
  id: string;
  type: SectionType;
  data: Record<string, any>;
}

function esc(str: any): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderSection(section: Section, theme: Theme): string {
  const pc = theme.primaryColor || '#4F46E5';
  const d = section.data || {};

  switch (section.type) {

    case 'hero': {
      const bg = d.backgroundColor || pc;
      const tc = d.textColor || '#ffffff';
      return `<section style="background:${bg};padding:80px 24px;text-align:center;color:${tc}"><div style="max-width:800px;margin:0 auto"><h1 style="font-size:clamp(32px,6vw,60px);font-weight:900;line-height:1.1;margin:0 0 20px;letter-spacing:-1px">${esc(d.headline)}</h1>${d.subheadline ? `<p style="font-size:clamp(16px,2vw,20px);opacity:.85;margin:0 auto 40px;max-width:600px;line-height:1.6">${esc(d.subheadline)}</p>` : ''}<div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">${d.ctaText ? `<a href="${esc(d.ctaUrl || '#')}" style="background:white;color:${bg};padding:14px 36px;border-radius:50px;font-weight:700;font-size:17px;text-decoration:none;display:inline-block">${esc(d.ctaText)}</a>` : ''}${d.secondaryCtaText ? `<a href="${esc(d.secondaryCtaUrl || '#')}" style="border:2px solid rgba(255,255,255,.7);color:${tc};padding:12px 32px;border-radius:50px;font-weight:600;font-size:17px;text-decoration:none;display:inline-block">${esc(d.secondaryCtaText)}</a>` : ''}</div></div></section>`;
    }

    case 'features': {
      const items: any[] = d.items || [];
      return `<section style="background:#fff;padding:80px 24px"><div style="max-width:1100px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 12px;color:#111">${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p style="text-align:center;font-size:18px;color:#666;margin:0 auto 52px;max-width:600px">${esc(d.subtitle)}</p>` : '<div style="margin-bottom:52px"></div>'}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px">${items.map((i: any) => `<div style="padding:28px;border-radius:16px;background:#f8fafc;border:1px solid #e5e7eb"><div style="font-size:36px;margin-bottom:14px">${i.icon || '✨'}</div><h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111">${esc(i.title)}</h3><p style="font-size:14px;color:#666;line-height:1.6;margin:0">${esc(i.description)}</p></div>`).join('')}</div></div></section>`;
    }

    case 'testimonials': {
      const items: any[] = d.items || [];
      return `<section style="background:#f8fafc;padding:80px 24px"><div style="max-width:1100px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 52px;color:#111">${esc(d.title)}</h2>` : ''}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">${items.map((i: any) => `<div style="background:white;border-radius:16px;padding:28px;border:1px solid #e5e7eb"><p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 20px;font-style:italic">&ldquo;${esc(i.quote)}&rdquo;</p><div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:50%;background:${pc};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0">${(i.name || '?')[0].toUpperCase()}</div><div><div style="font-weight:700;font-size:14px;color:#111">${esc(i.name)}</div><div style="font-size:12px;color:#888">${esc(i.role)}${i.company ? ` · ${esc(i.company)}` : ''}</div></div></div></div>`).join('')}</div></div></section>`;
    }

    case 'pricing': {
      const plans: any[] = d.plans || [];
      return `<section style="background:#fff;padding:80px 24px"><div style="max-width:1060px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 12px;color:#111">${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p style="text-align:center;font-size:18px;color:#666;margin:0 auto 52px;max-width:600px">${esc(d.subtitle)}</p>` : '<div style="margin-bottom:52px"></div>'}<div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;align-items:stretch">${plans.map((p: any) => `<div style="background:${p.highlighted ? pc : '#f8fafc'};color:${p.highlighted ? '#fff' : '#111'};border-radius:20px;padding:36px 28px;width:280px;border:${p.highlighted ? 'none' : '1px solid #e5e7eb'};box-shadow:${p.highlighted ? '0 16px 40px rgba(0,0,0,.12)' : 'none'}"><div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:8px">${esc(p.name)}</div><div style="font-size:44px;font-weight:900;margin-bottom:2px">${esc(p.price)}</div><div style="font-size:13px;opacity:.6;margin-bottom:28px">${esc(p.period || '')}</div><ul style="list-style:none;padding:0;margin:0 0 28px">${(p.features || []).map((f: string) => `<li style="padding:7px 0;border-bottom:1px solid ${p.highlighted ? 'rgba(255,255,255,.2)' : '#e5e7eb'};font-size:14px;display:flex;gap:8px;align-items:center"><span style="color:${p.highlighted ? '#fff' : pc}">✓</span>${esc(f)}</li>`).join('')}</ul><a href="#" style="display:block;text-align:center;background:${p.highlighted ? 'white' : pc};color:${p.highlighted ? pc : 'white'};padding:12px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">${esc(p.ctaText || 'Get Started')}</a></div>`).join('')}</div></div></section>`;
    }

    case 'cta': {
      const bg = d.backgroundColor || pc;
      return `<section style="background:${bg};padding:80px 24px;text-align:center"><div style="max-width:700px;margin:0 auto"><h2 style="font-size:clamp(28px,4vw,48px);font-weight:800;color:white;margin:0 0 16px;line-height:1.15">${esc(d.headline)}</h2>${d.subheadline ? `<p style="font-size:18px;color:rgba(255,255,255,.8);margin:0 0 40px;line-height:1.6">${esc(d.subheadline)}</p>` : ''}${d.ctaText ? `<a href="${esc(d.ctaUrl || '#')}" style="background:white;color:${bg};padding:14px 44px;border-radius:50px;font-weight:700;font-size:17px;text-decoration:none;display:inline-block">${esc(d.ctaText)}</a>` : ''}</div></section>`;
    }

    case 'contact': {
      const fields: any[] = d.fields || [{ label: 'Name', type: 'text', placeholder: 'Your name' }, { label: 'Email', type: 'email', placeholder: 'your@email.com' }, { label: 'Message', type: 'textarea', placeholder: 'Your message' }];
      return `<section style="background:#f8fafc;padding:80px 24px"><div style="max-width:580px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 12px;color:#111">${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p style="text-align:center;font-size:17px;color:#666;margin:0 0 36px">${esc(d.subtitle)}</p>` : ''}<div style="background:white;border-radius:20px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.06)">${fields.map((f: any) => `<div style="margin-bottom:18px"><label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;color:#444">${esc(f.label)}</label><div style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;color:#aaa;background:#fafafa;${f.type === 'textarea' ? 'min-height:90px' : ''}">${esc(f.placeholder)}</div></div>`).join('')}<div style="background:${pc};color:white;padding:13px;border-radius:8px;font-size:15px;font-weight:700;text-align:center">${esc(d.submitText || 'Send Message')}</div></div></div></section>`;
    }

    case 'footer': {
      const links: any[] = d.links || [];
      return `<footer style="background:#0f172a;color:rgba(255,255,255,.6);padding:48px 24px;text-align:center"><div style="max-width:1000px;margin:0 auto">${d.logo ? `<div style="font-size:22px;font-weight:800;color:white;margin-bottom:8px">${esc(d.logo)}</div>` : ''}${d.tagline ? `<p style="font-size:14px;margin:0 0 24px;opacity:.6">${esc(d.tagline)}</p>` : ''}${links.length ? `<div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-bottom:28px">${links.map((l: any) => `<a href="${esc(l.url || '#')}" style="color:rgba(255,255,255,.5);text-decoration:none;font-size:14px">${esc(l.label)}</a>`).join('')}</div>` : ''}${d.copyright ? `<p style="font-size:12px;opacity:.4;margin:0">${esc(d.copyright)}</p>` : ''}</div></footer>`;
    }

    default: return '';
  }
}

export function renderPage(sections: Section[], theme: Theme, name: string): string {
  const ff = theme.fontFamily || 'system-ui,-apple-system,sans-serif';
  const body = sections.map(s => renderSection(s, theme)).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:${ff}}</style></head><body>${body}</body></html>`;
}

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  features: 'Features',
  testimonials: 'Testimonials',
  pricing: 'Pricing',
  cta: 'Call to Action',
  contact: 'Contact Form',
  footer: 'Footer',
};

export const SECTION_ICONS: Record<SectionType, string> = {
  hero: '🦸',
  features: '⚡',
  testimonials: '💬',
  pricing: '💰',
  cta: '📣',
  contact: '📬',
  footer: '🔻',
};

export function defaultSection(type: SectionType): Section {
  const id = Math.random().toString(36).slice(2, 8);
  const defaults: Record<SectionType, any> = {
    hero: { headline: 'Your Amazing Headline', subheadline: 'A short description of your product or service.', ctaText: 'Get Started', ctaUrl: '#', backgroundColor: '#4F46E5', textColor: '#ffffff' },
    features: { title: 'Why Choose Us', subtitle: 'Everything you need to succeed.', columns: 3, items: [{ icon: '🚀', title: 'Fast', description: 'Lightning fast performance.' }, { icon: '🔒', title: 'Secure', description: 'Enterprise-grade security.' }, { icon: '💡', title: 'Smart', description: 'Intelligent features.' }] },
    testimonials: { title: 'What Our Customers Say', items: [{ quote: 'This product changed our business completely.', name: 'Jane Doe', role: 'CEO', company: 'Acme Inc' }, { quote: 'Incredible results from day one.', name: 'John Smith', role: 'Founder', company: 'TechCo' }] },
    pricing: { title: 'Simple Pricing', subtitle: 'No hidden fees.', plans: [{ name: 'Starter', price: 'Free', period: 'forever', features: ['5 projects', '1 user', 'Basic support'], highlighted: false, ctaText: 'Get Started' }, { name: 'Pro', price: '$29', period: '/month', features: ['Unlimited projects', '5 users', 'Priority support', 'Analytics'], highlighted: true, ctaText: 'Start Free Trial' }] },
    cta: { headline: 'Ready to Get Started?', subheadline: 'Join thousands of happy customers today.', ctaText: 'Start Free Trial', ctaUrl: '#', backgroundColor: '#4F46E5' },
    contact: { title: 'Get in Touch', subtitle: "We'd love to hear from you.", fields: [{ label: 'Name', type: 'text', placeholder: 'Your name' }, { label: 'Email', type: 'email', placeholder: 'your@email.com' }, { label: 'Message', type: 'textarea', placeholder: 'How can we help?' }], submitText: 'Send Message' },
    footer: { logo: 'YourBrand', tagline: 'Building the future, one step at a time.', links: [{ label: 'About', url: '#' }, { label: 'Privacy', url: '#' }, { label: 'Contact', url: '#' }], copyright: `© ${new Date().getFullYear()} YourBrand. All rights reserved.` },
  };
  return { id, type, data: defaults[type] };
}
