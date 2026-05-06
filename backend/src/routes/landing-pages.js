const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const fetch = require('node-fetch');

const router = express.Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS landing_pages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    sections TEXT DEFAULT '',
    theme TEXT DEFAULT '',
    html TEXT DEFAULT '',
    css TEXT DEFAULT '',
    is_template INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
try { db.exec('ALTER TABLE landing_pages ADD COLUMN sections TEXT DEFAULT ""'); } catch (_) {}
try { db.exec('ALTER TABLE landing_pages ADD COLUMN theme TEXT DEFAULT ""'); } catch (_) {}

// ── HTML rendering ────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderSection(section, theme) {
  const pc = (theme && theme.primaryColor) || '#4F46E5';
  const d = section.data || {};

  switch (section.type) {

    case 'hero': {
      const bg = d.backgroundColor || pc;
      const tc = d.textColor || '#ffffff';
      return `<section style="background:${bg};padding:80px 24px;text-align:center;color:${tc}"><div style="max-width:800px;margin:0 auto"><h1 style="font-size:clamp(32px,6vw,60px);font-weight:900;line-height:1.1;margin:0 0 20px;letter-spacing:-1px">${esc(d.headline)}</h1>${d.subheadline ? `<p style="font-size:clamp(16px,2vw,20px);opacity:.85;margin:0 auto 40px;max-width:600px;line-height:1.6">${esc(d.subheadline)}</p>` : ''}<div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">${d.ctaText ? `<a href="${esc(d.ctaUrl || '#')}" style="background:white;color:${bg};padding:14px 36px;border-radius:50px;font-weight:700;font-size:17px;text-decoration:none;display:inline-block">${esc(d.ctaText)}</a>` : ''}${d.secondaryCtaText ? `<a href="${esc(d.secondaryCtaUrl || '#')}" style="border:2px solid rgba(255,255,255,.7);color:${tc};padding:12px 32px;border-radius:50px;font-weight:600;font-size:17px;text-decoration:none;display:inline-block">${esc(d.secondaryCtaText)}</a>` : ''}</div></div></section>`;
    }

    case 'features': {
      const items = d.items || [];
      return `<section style="background:#fff;padding:80px 24px"><div style="max-width:1100px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 12px;color:#111">${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p style="text-align:center;font-size:18px;color:#666;margin:0 auto 52px;max-width:600px">${esc(d.subtitle)}</p>` : '<div style="margin-bottom:52px"></div>'}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px">${items.map(i => `<div style="padding:28px;border-radius:16px;background:#f8fafc;border:1px solid #e5e7eb"><div style="font-size:36px;margin-bottom:14px">${i.icon || '✨'}</div><h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111">${esc(i.title)}</h3><p style="font-size:14px;color:#666;line-height:1.6;margin:0">${esc(i.description)}</p></div>`).join('')}</div></div></section>`;
    }

    case 'testimonials': {
      const items = d.items || [];
      return `<section style="background:#f8fafc;padding:80px 24px"><div style="max-width:1100px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 52px;color:#111">${esc(d.title)}</h2>` : ''}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">${items.map(i => `<div style="background:white;border-radius:16px;padding:28px;border:1px solid #e5e7eb"><p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 20px;font-style:italic">&ldquo;${esc(i.quote)}&rdquo;</p><div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:50%;background:${pc};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0">${(i.name || '?')[0].toUpperCase()}</div><div><div style="font-weight:700;font-size:14px;color:#111">${esc(i.name)}</div><div style="font-size:12px;color:#888">${esc(i.role)}${i.company ? ` · ${esc(i.company)}` : ''}</div></div></div></div>`).join('')}</div></div></section>`;
    }

    case 'pricing': {
      const plans = d.plans || [];
      return `<section style="background:#fff;padding:80px 24px"><div style="max-width:1060px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 12px;color:#111">${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p style="text-align:center;font-size:18px;color:#666;margin:0 auto 52px;max-width:600px">${esc(d.subtitle)}</p>` : '<div style="margin-bottom:52px"></div>'}<div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;align-items:stretch">${plans.map(p => `<div style="background:${p.highlighted ? pc : '#f8fafc'};color:${p.highlighted ? '#fff' : '#111'};border-radius:20px;padding:36px 28px;width:280px;border:${p.highlighted ? 'none' : '1px solid #e5e7eb'};box-shadow:${p.highlighted ? '0 16px 40px rgba(0,0,0,.12)' : 'none'}"><div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;opacity:.7;margin-bottom:8px">${esc(p.name)}</div><div style="font-size:44px;font-weight:900;margin-bottom:2px">${esc(p.price)}</div><div style="font-size:13px;opacity:.6;margin-bottom:28px">${esc(p.period || '')}</div><ul style="list-style:none;padding:0;margin:0 0 28px">${(p.features || []).map(f => `<li style="padding:7px 0;border-bottom:1px solid ${p.highlighted ? 'rgba(255,255,255,.2)' : '#e5e7eb'};font-size:14px;display:flex;gap:8px;align-items:center"><span style="color:${p.highlighted ? '#fff' : pc}">✓</span>${esc(f)}</li>`).join('')}</ul><a href="#" style="display:block;text-align:center;background:${p.highlighted ? 'white' : pc};color:${p.highlighted ? pc : 'white'};padding:12px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">${esc(p.ctaText || 'Get Started')}</a></div>`).join('')}</div></div></section>`;
    }

    case 'cta': {
      const bg = d.backgroundColor || pc;
      return `<section style="background:${bg};padding:80px 24px;text-align:center"><div style="max-width:700px;margin:0 auto"><h2 style="font-size:clamp(28px,4vw,48px);font-weight:800;color:white;margin:0 0 16px;line-height:1.15">${esc(d.headline)}</h2>${d.subheadline ? `<p style="font-size:18px;color:rgba(255,255,255,.8);margin:0 0 40px;line-height:1.6">${esc(d.subheadline)}</p>` : ''}${d.ctaText ? `<a href="${esc(d.ctaUrl || '#')}" style="background:white;color:${bg};padding:14px 44px;border-radius:50px;font-weight:700;font-size:17px;text-decoration:none;display:inline-block">${esc(d.ctaText)}</a>` : ''}</div></section>`;
    }

    case 'contact': {
      const fields = d.fields || [{ label: 'Name', type: 'text', placeholder: 'Your name' }, { label: 'Email', type: 'email', placeholder: 'your@email.com' }, { label: 'Message', type: 'textarea', placeholder: 'Your message' }];
      return `<section style="background:#f8fafc;padding:80px 24px"><div style="max-width:580px;margin:0 auto">${d.title ? `<h2 style="text-align:center;font-size:clamp(24px,4vw,40px);font-weight:800;margin:0 0 12px;color:#111">${esc(d.title)}</h2>` : ''}${d.subtitle ? `<p style="text-align:center;font-size:17px;color:#666;margin:0 0 36px">${esc(d.subtitle)}</p>` : ''}<div style="background:white;border-radius:20px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.06)">${fields.map(f => `<div style="margin-bottom:18px"><label style="display:block;font-weight:600;font-size:13px;margin-bottom:6px;color:#444">${esc(f.label)}</label><div style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;color:#aaa;background:#fafafa;${f.type === 'textarea' ? 'min-height:90px' : ''}">${esc(f.placeholder)}</div></div>`).join('')}<div style="background:${pc};color:white;padding:13px;border-radius:8px;font-size:15px;font-weight:700;text-align:center;cursor:pointer">${esc(d.submitText || 'Send Message')}</div></div></div></section>`;
    }

    case 'footer': {
      const links = d.links || [];
      return `<footer style="background:#0f172a;color:rgba(255,255,255,.6);padding:48px 24px;text-align:center"><div style="max-width:1000px;margin:0 auto">${d.logo ? `<div style="font-size:22px;font-weight:800;color:white;margin-bottom:8px">${esc(d.logo)}</div>` : ''}${d.tagline ? `<p style="font-size:14px;margin:0 0 24px;opacity:.6">${esc(d.tagline)}</p>` : ''}${links.length ? `<div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-bottom:28px">${links.map(l => `<a href="${esc(l.url || '#')}" style="color:rgba(255,255,255,.5);text-decoration:none;font-size:14px">${esc(l.label)}</a>`).join('')}</div>` : ''}${d.copyright ? `<p style="font-size:12px;opacity:.4;margin:0">${esc(d.copyright)}</p>` : ''}</div></footer>`;
    }

    default: return '';
  }
}

function buildPageHTML(name, sections, theme) {
  const ff = (theme && theme.fontFamily) || 'system-ui,-apple-system,sans-serif';
  const body = (sections || []).map(s => renderSection(s, theme)).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:${ff}}</style></head><body>${body}</body></html>`;
}

// ── AI helpers ────────────────────────────────────────────────────────────────

const SCHEMA_PROMPT = `
Return ONLY a valid JSON object (no markdown, no code blocks, no explanation) with this structure:
{
  "theme": { "primaryColor": "#hexcolor", "fontFamily": "Inter, sans-serif" },
  "sections": [ ...array of section objects... ]
}

Available section types (use exact field names):
- hero: { headline, subheadline, ctaText, ctaUrl, secondaryCtaText(optional), secondaryCtaUrl(optional), backgroundColor, textColor }
- features: { title, subtitle, columns:3, items:[{icon:"emoji", title, description}] }  (3-6 items)
- testimonials: { title, items:[{quote, name, role, company}] }  (3-4 items)
- pricing: { title, subtitle, plans:[{name, price:"$X", period:"/month", features:["string"], highlighted:true/false, ctaText}] }  (2-3 plans)
- cta: { headline, subheadline, ctaText, ctaUrl, backgroundColor }
- contact: { title, subtitle, fields:[{label, type:"text"/"email"/"textarea", placeholder}], submitText }
- footer: { logo, tagline, links:[{label, url:"#"}], copyright }

Each section object: { "id": "unique-string", "type": "sectiontype", "data": { ...fields... } }
Always include hero as first and footer as last. Total 4-6 sections.`;

async function callGemini(prompt, imageBase64, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const parts = [];
  if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' } });
  parts.push({ text: prompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );

  const json = await res.json();

  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json);
    console.error('[Gemini] API error:', res.status, msg);
    throw new Error(`Gemini ${res.status}: ${msg}`);
  }

  const text = (json.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/^```(?:json)?\n?/gm, '').replace(/\n?```$/gm, '').trim();
  console.log('[Gemini] Response text (first 200):', text.slice(0, 200));
  return JSON.parse(text);
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);
}

// ── AI routes (must be before /:id) ─────────────────────────────────────────

router.post('/ai/generate', authenticate, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description required' });
    const prompt = `You are a professional landing page designer and copywriter.\nCreate a complete landing page for this business: "${description}"\n${SCHEMA_PROMPT}\nMake the content specific, compelling, and professional. Choose colors that fit the business type.`;
    const data = await callGemini(prompt);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/analyze-screenshot', authenticate, async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    const prompt = `Analyze this landing page screenshot and recreate its structure as an editable page template.\n${SCHEMA_PROMPT}\nMatch the visual style, color scheme, and content structure visible in the screenshot. Extract any readable text.`;
    const data = await callGemini(prompt, imageBase64, mimeType);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/analyze-url', authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'valid http(s) URL required' });
    const html = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }).then(r => r.text());
    const text = extractText(html);
    const prompt = `Analyze this webpage content and recreate it as a landing page template.\n${SCHEMA_PROMPT}\nPage content:\n${text}`;
    const data = await callGemini(prompt);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ai/rewrite-section', authenticate, async (req, res) => {
  try {
    const { section, instruction, theme } = req.body;
    if (!section || !instruction) return res.status(400).json({ error: 'section and instruction required' });
    const prompt = `Rewrite this landing page section based on this instruction: "${instruction}"\n\nCurrent section JSON:\n${JSON.stringify(section, null, 2)}\n\nReturn ONLY the updated "data" object as valid JSON (no markdown, no wrapper).`;
    const updated = await callGemini(prompt);
    res.json({ data: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CRUD routes ───────────────────────────────────────────────────────────────

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, slug, is_template, created_by, created_at, updated_at
    FROM landing_pages WHERE created_by = ? OR is_template = 1
    ORDER BY is_template DESC, updated_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// Public view — no auth
router.get('/pub/:slug', (req, res) => {
  const page = db.prepare('SELECT name, sections, theme, html, css FROM landing_pages WHERE slug = ?').get(req.params.slug);
  if (!page) return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px">Page not found</h1>');

  if (page.sections) {
    try {
      const sections = JSON.parse(page.sections);
      const theme = page.theme ? JSON.parse(page.theme) : {};
      return res.send(buildPageHTML(page.name, sections, theme));
    } catch (_) {}
  }
  // Fallback to raw html
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.name)}</title><style>${page.css || ''}</style></head><body>${page.html || ''}</body></html>`);
});

router.get('/:id', authenticate, (req, res) => {
  const page = db.prepare('SELECT * FROM landing_pages WHERE id = ? AND (created_by = ? OR is_template = 1)').get(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Not found' });
  res.json(page);
});

router.post('/', authenticate, (req, res) => {
  const { name, sections, theme, html, css } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + id.slice(0, 6);
  db.prepare(`INSERT INTO landing_pages (id, name, slug, sections, theme, html, css, is_template, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run(id, name, slug, sections ? JSON.stringify(sections) : '', theme ? JSON.stringify(theme) : '', html || '', css || '', req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(id));
});

router.put('/:id', authenticate, (req, res) => {
  const existing = db.prepare('SELECT * FROM landing_pages WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, sections, theme, html, css } = req.body;
  db.prepare(`UPDATE landing_pages SET
    name = COALESCE(?, name),
    sections = COALESCE(?, sections),
    theme = COALESCE(?, theme),
    html = COALESCE(?, html),
    css = COALESCE(?, css),
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`)
    .run(
      name || null,
      sections !== undefined ? JSON.stringify(sections) : null,
      theme !== undefined ? JSON.stringify(theme) : null,
      html || null,
      css || null,
      req.params.id
    );
  res.json(db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authenticate, (req, res) => {
  const page = db.prepare('SELECT id FROM landing_pages WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM landing_pages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
