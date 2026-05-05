const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

db.exec(`
  CREATE TABLE IF NOT EXISTS landing_pages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    html TEXT DEFAULT '',
    css TEXT DEFAULT '',
    gjson TEXT DEFAULT '',
    is_template INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed built-in templates once
const templateCount = db.prepare("SELECT COUNT(*) as n FROM landing_pages WHERE is_template = 1").get().n;
if (templateCount === 0) {
  const templates = [
    {
      name: 'Hero Landing Page',
      html: `<section style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:80px 20px;text-align:center;color:white"><h1 style="font-size:48px;font-weight:800;margin-bottom:16px">Your Amazing Product</h1><p style="font-size:20px;opacity:.9;max-width:600px;margin:0 auto 32px">The best solution for your needs. Start today and transform your business.</p><a href="#" style="display:inline-block;background:white;color:#667eea;padding:16px 40px;border-radius:50px;font-weight:700;font-size:18px;text-decoration:none">Get Started Free</a></section><section style="padding:60px 20px;max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:32px;text-align:center"><div><div style="font-size:40px;margin-bottom:12px">🚀</div><h3 style="font-size:20px;font-weight:700;margin-bottom:8px">Fast</h3><p style="color:#666">Lightning fast performance that scales with your business.</p></div><div><div style="font-size:40px;margin-bottom:12px">🔒</div><h3 style="font-size:20px;font-weight:700;margin-bottom:8px">Secure</h3><p style="color:#666">Enterprise-grade security to protect your data always.</p></div><div><div style="font-size:40px;margin-bottom:12px">💡</div><h3 style="font-size:20px;font-weight:700;margin-bottom:8px">Smart</h3><p style="color:#666">Intelligent features that make your life easier.</p></div></section>`,
      css: `body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}`
    },
    {
      name: 'Contact Page',
      html: `<section style="max-width:600px;margin:60px auto;padding:0 20px"><h1 style="font-size:36px;font-weight:800;text-align:center;margin-bottom:8px">Get in Touch</h1><p style="text-align:center;color:#666;margin-bottom:40px">We'd love to hear from you. Send us a message!</p><form style="background:white;border-radius:16px;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08)"><div style="margin-bottom:20px"><label style="display:block;font-weight:600;margin-bottom:6px">Name</label><input type="text" placeholder="Your name" style="width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:8px;font-size:16px;box-sizing:border-box"/></div><div style="margin-bottom:20px"><label style="display:block;font-weight:600;margin-bottom:6px">Email</label><input type="email" placeholder="your@email.com" style="width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:8px;font-size:16px;box-sizing:border-box"/></div><div style="margin-bottom:24px"><label style="display:block;font-weight:600;margin-bottom:6px">Message</label><textarea placeholder="How can we help?" rows="5" style="width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:8px;font-size:16px;box-sizing:border-box;resize:vertical"></textarea></div><button type="submit" style="width:100%;background:#0073ea;color:white;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer">Send Message</button></form></section>`,
      css: `body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc}`
    },
    {
      name: 'Coming Soon',
      html: `<section style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0c29;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);color:white;text-align:center;padding:40px 20px"><div><div style="font-size:60px;margin-bottom:24px">⚡</div><h1 style="font-size:56px;font-weight:900;margin-bottom:16px;letter-spacing:-2px">Coming Soon</h1><p style="font-size:20px;opacity:.7;max-width:500px;margin:0 auto 40px">We're working on something amazing. Leave your email and be the first to know.</p><div style="display:flex;gap:12px;max-width:400px;margin:0 auto"><input type="email" placeholder="Enter your email" style="flex:1;padding:14px 20px;border:none;border-radius:50px;font-size:16px"/><button style="background:#667eea;color:white;border:none;padding:14px 28px;border-radius:50px;font-size:16px;font-weight:700;cursor:pointer;white-space:nowrap">Notify Me</button></div></div></section>`,
      css: `body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}`
    },
    {
      name: 'Product Page',
      html: `<nav style="padding:16px 40px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e5e7eb"><div style="font-size:24px;font-weight:800;color:#0073ea">Brand</div><a href="#" style="background:#0073ea;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">Buy Now</a></nav><section style="max-width:1100px;margin:60px auto;padding:0 40px;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center"><div><div style="background:linear-gradient(135deg,#667eea22,#764ba222);border-radius:24px;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:120px">📦</div></div><div><p style="color:#667eea;font-weight:600;margin-bottom:8px">NEW ARRIVAL</p><h1 style="font-size:40px;font-weight:800;margin-bottom:16px;line-height:1.2">The Product You've Been Waiting For</h1><p style="color:#666;font-size:18px;margin-bottom:24px">Premium quality, exceptional performance. Everything you need in one place.</p><div style="font-size:36px;font-weight:800;color:#0073ea;margin-bottom:24px">$99 <span style="font-size:18px;color:#999;text-decoration:line-through;font-weight:400">$149</span></div><button style="background:#0073ea;color:white;padding:16px 40px;border:none;border-radius:12px;font-size:18px;font-weight:700;cursor:pointer;width:100%">Add to Cart</button></div></section>`,
      css: `body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}`
    },
    {
      name: 'Blank Page',
      html: `<section style="min-height:100vh;display:flex;align-items:center;justify-content:center"><p style="color:#999;font-size:18px">Start building your page...</p></section>`,
      css: `body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}`
    },
  ];

  const insert = db.prepare(`INSERT INTO landing_pages (id, name, slug, html, css, gjson, is_template, created_by) VALUES (?, ?, ?, ?, ?, '', 1, 'system')`);
  templates.forEach(t => {
    const id = uuidv4();
    insert.run(id, t.name, `template-${id.slice(0,6)}`, t.html, t.css);
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, slug, is_template, created_by, created_at, updated_at
    FROM landing_pages
    WHERE created_by = ? OR is_template = 1
    ORDER BY is_template DESC, updated_at DESC
  `).all(req.user.id);
  res.json(rows);
});

router.get('/:id', authenticate, (req, res) => {
  const page = db.prepare(
    'SELECT * FROM landing_pages WHERE id = ? AND (created_by = ? OR is_template = 1)'
  ).get(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Not found' });
  res.json(page);
});

// Public view — no auth needed
router.get('/pub/:slug', (req, res) => {
  const page = db.prepare('SELECT name, html, css FROM landing_pages WHERE slug = ?').get(req.params.slug);
  if (!page) return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px">Page not found</h1>');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${page.name}</title><style>${page.css}</style></head><body>${page.html}</body></html>`);
});

router.post('/', authenticate, (req, res) => {
  const { name, html, css, gjson } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + id.slice(0, 6);
  db.prepare(`INSERT INTO landing_pages (id, name, slug, html, css, gjson, is_template, created_by) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
    .run(id, name, slug, html || '', css || '', gjson || '', req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(id));
});

router.put('/:id', authenticate, (req, res) => {
  const existing = db.prepare('SELECT * FROM landing_pages WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { name, html, css, gjson } = req.body;
  db.prepare(`UPDATE landing_pages SET
    name = COALESCE(?, name), html = ?, css = ?, gjson = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`)
    .run(name || null, html ?? existing.html, css ?? existing.css, gjson ?? existing.gjson, req.params.id);
  res.json(db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authenticate, (req, res) => {
  const page = db.prepare('SELECT id FROM landing_pages WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!page) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM landing_pages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
