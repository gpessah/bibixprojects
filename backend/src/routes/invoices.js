const express = require('express');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Create tables ─────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS invoice_my_companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    vat_number TEXT,
    bank_name TEXT,
    bank_account TEXT,
    bank_swift TEXT,
    logo_url TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoice_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    vat_number TEXT,
    contact_person TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL,
    my_company_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'draft',
    currency TEXT DEFAULT 'USD',
    notes TEXT,
    tax_rate REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit_price REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    position INTEGER DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  );
`);

// ── Helper: recalc totals from items ─────────────────────────────────────────
function calcTotals(items, taxRate, discount) {
  const subtotal = items.reduce((s, it) => s + (it.quantity * it.unit_price), 0);
  const discountedSubtotal = subtotal - (discount || 0);
  const tax_amount = discountedSubtotal * ((taxRate || 0) / 100);
  const total = discountedSubtotal + tax_amount;
  return { subtotal, tax_amount, total };
}

// ════════════════════════════════════════════════════════════════════════════
// MY COMPANIES
// ════════════════════════════════════════════════════════════════════════════

router.get('/my-companies', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM invoice_my_companies WHERE created_by = ? ORDER BY name').all(req.user.id);
  res.json(rows);
});

router.post('/my-companies', authenticate, (req, res) => {
  const { name, address, city, country, phone, email, vat_number, bank_name, bank_account, bank_swift, logo_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO invoice_my_companies
    (id, name, address, city, country, phone, email, vat_number, bank_name, bank_account, bank_swift, logo_url, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, address || null, city || null, country || null, phone || null,
         email || null, vat_number || null, bank_name || null, bank_account || null,
         bank_swift || null, logo_url || null, req.user.id);
  const row = db.prepare('SELECT * FROM invoice_my_companies WHERE id = ?').get(id);
  res.status(201).json(row);
});

router.put('/my-companies/:id', authenticate, (req, res) => {
  const company = db.prepare('SELECT * FROM invoice_my_companies WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!company) return res.status(404).json({ error: 'Not found' });
  const { name, address, city, country, phone, email, vat_number, bank_name, bank_account, bank_swift, logo_url } = req.body;
  db.prepare(`UPDATE invoice_my_companies SET
    name = COALESCE(?, name), address = ?, city = ?, country = ?, phone = ?,
    email = ?, vat_number = ?, bank_name = ?, bank_account = ?, bank_swift = ?, logo_url = ?
    WHERE id = ?`)
    .run(name || null, address ?? company.address, city ?? company.city,
         country ?? company.country, phone ?? company.phone, email ?? company.email,
         vat_number ?? company.vat_number, bank_name ?? company.bank_name,
         bank_account ?? company.bank_account, bank_swift ?? company.bank_swift,
         logo_url ?? company.logo_url, req.params.id);
  res.json(db.prepare('SELECT * FROM invoice_my_companies WHERE id = ?').get(req.params.id));
});

router.delete('/my-companies/:id', authenticate, (req, res) => {
  const company = db.prepare('SELECT id FROM invoice_my_companies WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!company) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM invoice_my_companies WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════════════════════════

router.get('/clients', authenticate, (req, res) => {
  const rows = db.prepare('SELECT * FROM invoice_clients WHERE created_by = ? ORDER BY name').all(req.user.id);
  res.json(rows);
});

router.post('/clients', authenticate, (req, res) => {
  const { name, address, city, country, phone, email, vat_number, contact_person } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuidv4();
  db.prepare(`INSERT INTO invoice_clients
    (id, name, address, city, country, phone, email, vat_number, contact_person, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, address || null, city || null, country || null, phone || null,
         email || null, vat_number || null, contact_person || null, req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM invoice_clients WHERE id = ?').get(id));
});

router.put('/clients/:id', authenticate, (req, res) => {
  const client = db.prepare('SELECT * FROM invoice_clients WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ error: 'Not found' });
  const { name, address, city, country, phone, email, vat_number, contact_person } = req.body;
  db.prepare(`UPDATE invoice_clients SET
    name = COALESCE(?, name), address = ?, city = ?, country = ?, phone = ?,
    email = ?, vat_number = ?, contact_person = ?
    WHERE id = ?`)
    .run(name || null, address ?? client.address, city ?? client.city,
         country ?? client.country, phone ?? client.phone, email ?? client.email,
         vat_number ?? client.vat_number, contact_person ?? client.contact_person, req.params.id);
  res.json(db.prepare('SELECT * FROM invoice_clients WHERE id = ?').get(req.params.id));
});

router.delete('/clients/:id', authenticate, (req, res) => {
  const client = db.prepare('SELECT id FROM invoice_clients WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM invoice_clients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// INVOICES
// ════════════════════════════════════════════════════════════════════════════

router.get('/', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT i.*,
           c.name  AS company_name,
           cl.name AS client_name
    FROM invoices i
    LEFT JOIN invoice_my_companies c  ON c.id = i.my_company_id
    LEFT JOIN invoice_clients      cl ON cl.id = i.client_id
    WHERE i.created_by = ?
    ORDER BY i.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

router.get('/:id', authenticate, (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*,
           c.name  AS company_name,
           cl.name AS client_name
    FROM invoices i
    LEFT JOIN invoice_my_companies c  ON c.id = i.my_company_id
    LEFT JOIN invoice_clients      cl ON cl.id = i.client_id
    WHERE i.id = ? AND i.created_by = ?
  `).get(req.params.id, req.user.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(req.params.id);
  res.json({ ...invoice, items });
});

router.post('/', authenticate, (req, res) => {
  const {
    invoice_number, my_company_id, client_id, issue_date, due_date,
    status, currency, notes, tax_rate, discount, items = []
  } = req.body;

  if (!invoice_number || !my_company_id || !client_id || !issue_date) {
    return res.status(400).json({ error: 'invoice_number, my_company_id, client_id, issue_date are required' });
  }

  const { subtotal, tax_amount, total } = calcTotals(items, tax_rate, discount);
  const id = uuidv4();

  db.prepare(`INSERT INTO invoices
    (id, invoice_number, my_company_id, client_id, issue_date, due_date, status, currency, notes,
     tax_rate, discount, subtotal, tax_amount, total, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, invoice_number, my_company_id, client_id, issue_date, due_date || null,
         status || 'draft', currency || 'USD', notes || null,
         tax_rate || 0, discount || 0, subtotal, tax_amount, total, req.user.id);

  const insertItem = db.prepare(`INSERT INTO invoice_items
    (id, invoice_id, description, quantity, unit_price, amount, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  items.forEach((it, idx) => {
    const amt = (it.quantity || 1) * (it.unit_price || 0);
    insertItem.run(uuidv4(), id, it.description, it.quantity || 1, it.unit_price || 0, amt, idx);
  });

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  const savedItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(id);
  res.status(201).json({ ...invoice, items: savedItems });
});

router.put('/:id', authenticate, (req, res) => {
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    invoice_number, my_company_id, client_id, issue_date, due_date,
    status, currency, notes, tax_rate, discount, items
  } = req.body;

  const newItems = items !== undefined ? items : db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(req.params.id);
  const usedTaxRate = tax_rate !== undefined ? tax_rate : existing.tax_rate;
  const usedDiscount = discount !== undefined ? discount : existing.discount;
  const { subtotal, tax_amount, total } = calcTotals(newItems, usedTaxRate, usedDiscount);

  db.prepare(`UPDATE invoices SET
    invoice_number = COALESCE(?, invoice_number),
    my_company_id  = COALESCE(?, my_company_id),
    client_id      = COALESCE(?, client_id),
    issue_date     = COALESCE(?, issue_date),
    due_date       = ?,
    status         = COALESCE(?, status),
    currency       = COALESCE(?, currency),
    notes          = ?,
    tax_rate       = ?,
    discount       = ?,
    subtotal       = ?,
    tax_amount     = ?,
    total          = ?,
    updated_at     = CURRENT_TIMESTAMP
    WHERE id = ?`)
    .run(
      invoice_number || null, my_company_id || null, client_id || null, issue_date || null,
      due_date !== undefined ? (due_date || null) : existing.due_date,
      status || null, currency || null,
      notes !== undefined ? (notes || null) : existing.notes,
      usedTaxRate, usedDiscount, subtotal, tax_amount, total,
      req.params.id
    );

  if (items !== undefined) {
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(req.params.id);
    const insertItem = db.prepare(`INSERT INTO invoice_items
      (id, invoice_id, description, quantity, unit_price, amount, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    items.forEach((it, idx) => {
      const amt = (it.quantity || 1) * (it.unit_price || 0);
      insertItem.run(uuidv4(), req.params.id, it.description, it.quantity || 1, it.unit_price || 0, amt, idx);
    });
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  const savedItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(req.params.id);
  res.json({ ...invoice, items: savedItems });
});

router.delete('/:id', authenticate, (req, res) => {
  const invoice = db.prepare('SELECT id FROM invoices WHERE id = ? AND created_by = ?').get(req.params.id, req.user.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(req.params.id);
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════════
// PDF GENERATION
// ════════════════════════════════════════════════════════════════════════════

router.get('/:id/pdf', authenticate, (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, c.*, cl.name AS client_name, cl.address AS client_address,
           cl.city AS client_city, cl.country AS client_country,
           cl.phone AS client_phone, cl.email AS client_email,
           cl.vat_number AS client_vat, cl.contact_person,
           c.name AS company_name, c.address AS company_address,
           c.city AS company_city, c.country AS company_country,
           c.phone AS company_phone, c.email AS company_email,
           c.vat_number AS company_vat, c.bank_name, c.bank_account, c.bank_swift
    FROM invoices i
    LEFT JOIN invoice_my_companies c  ON c.id = i.my_company_id
    LEFT JOIN invoice_clients      cl ON cl.id = i.client_id
    WHERE i.id = ? AND i.created_by = ?
  `).get(req.params.id, req.user.id);

  if (!invoice) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(req.params.id);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
  doc.pipe(res);

  const BLUE   = '#0073ea';
  const DARK   = '#1a1a2e';
  const GRAY   = '#6b7280';
  const LGRAY  = '#f3f4f6';
  const BLACK  = '#111827';
  const pageW  = doc.page.width;
  const margin = 50;
  const contentW = pageW - margin * 2;

  // ── Header band ────────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 110).fill(BLUE);

  // Company name (big, white)
  doc.font('Helvetica-Bold').fontSize(22).fillColor('white')
     .text(invoice.company_name || 'Your Company', margin, 28, { width: contentW * 0.6 });

  // Invoice label top-right
  doc.font('Helvetica-Bold').fontSize(12).fillColor('white')
     .text('INVOICE', margin + contentW * 0.6, 28, { width: contentW * 0.4, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('rgba(255,255,255,0.85)')
     .text(`#${invoice.invoice_number}`, margin + contentW * 0.6, 46, { width: contentW * 0.4, align: 'right' });

  // Status badge
  const STATUS_COLORS = { draft: '#9ca3af', sent: '#3b82f6', paid: '#10b981', cancelled: '#ef4444' };
  const statusColor = STATUS_COLORS[invoice.status] || '#9ca3af';
  const statusLabel = (invoice.status || 'draft').toUpperCase();
  doc.roundedRect(pageW - margin - 72, 64, 72, 22, 4).fill(statusColor);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('white')
     .text(statusLabel, pageW - margin - 72, 71, { width: 72, align: 'center' });

  // ── Dates row ──────────────────────────────────────────────────────────────
  let y = 130;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
     .text('ISSUE DATE', margin, y);
  doc.font('Helvetica').fontSize(10).fillColor(BLACK)
     .text(invoice.issue_date || '-', margin, y + 12);

  if (invoice.due_date) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
       .text('DUE DATE', margin + 140, y);
    doc.font('Helvetica').fontSize(10).fillColor(BLACK)
       .text(invoice.due_date, margin + 140, y + 12);
  }

  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
     .text('CURRENCY', margin + 280, y);
  doc.font('Helvetica').fontSize(10).fillColor(BLACK)
     .text(invoice.currency || 'USD', margin + 280, y + 12);

  // ── From / To ──────────────────────────────────────────────────────────────
  y = 185;
  const colW = contentW / 2 - 10;

  // FROM box
  doc.rect(margin, y, colW, 130).fill(LGRAY);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE)
     .text('FROM', margin + 12, y + 12);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
     .text(invoice.company_name || '', margin + 12, y + 26);
  let fromLines = [];
  if (invoice.company_address) fromLines.push(invoice.company_address);
  if (invoice.company_city || invoice.company_country)
    fromLines.push([invoice.company_city, invoice.company_country].filter(Boolean).join(', '));
  if (invoice.company_phone) fromLines.push(invoice.company_phone);
  if (invoice.company_email) fromLines.push(invoice.company_email);
  if (invoice.company_vat)   fromLines.push(`VAT: ${invoice.company_vat}`);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
     .text(fromLines.join('\n'), margin + 12, y + 42, { width: colW - 24 });

  // TO box
  const toX = margin + colW + 20;
  doc.rect(toX, y, colW, 130).fill(LGRAY);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE)
     .text('TO', toX + 12, y + 12);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
     .text(invoice.client_name || '', toX + 12, y + 26);
  let toLines = [];
  if (invoice.contact_person) toLines.push(invoice.contact_person);
  if (invoice.client_address) toLines.push(invoice.client_address);
  if (invoice.client_city || invoice.client_country)
    toLines.push([invoice.client_city, invoice.client_country].filter(Boolean).join(', '));
  if (invoice.client_phone) toLines.push(invoice.client_phone);
  if (invoice.client_email) toLines.push(invoice.client_email);
  if (invoice.client_vat)   toLines.push(`VAT: ${invoice.client_vat}`);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
     .text(toLines.join('\n'), toX + 12, y + 42, { width: colW - 24 });

  // ── Items table ────────────────────────────────────────────────────────────
  y = 335;

  // Table header
  doc.rect(margin, y, contentW, 24).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('white');
  doc.text('DESCRIPTION', margin + 10, y + 7, { width: contentW * 0.50 });
  doc.text('QTY',         margin + contentW * 0.52, y + 7, { width: 50, align: 'right' });
  doc.text('UNIT PRICE',  margin + contentW * 0.62, y + 7, { width: 80, align: 'right' });
  doc.text('AMOUNT',      margin + contentW * 0.77, y + 7, { width: contentW * 0.23 - 10, align: 'right' });

  y += 24;

  // Table rows
  items.forEach((item, idx) => {
    const rowH = 28;
    if (idx % 2 === 0) doc.rect(margin, y, contentW, rowH).fill('#f9fafb');
    else               doc.rect(margin, y, contentW, rowH).fill('white');

    doc.font('Helvetica').fontSize(9).fillColor(BLACK);
    doc.text(item.description || '', margin + 10, y + 9, { width: contentW * 0.50 });
    doc.text(String(item.quantity), margin + contentW * 0.52, y + 9, { width: 50, align: 'right' });
    doc.text(formatCurrency(item.unit_price, invoice.currency), margin + contentW * 0.62, y + 9, { width: 80, align: 'right' });
    doc.text(formatCurrency(item.amount, invoice.currency), margin + contentW * 0.77, y + 9, { width: contentW * 0.23 - 10, align: 'right' });

    y += rowH;
  });

  // Bottom border of table
  doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor('#e5e7eb').lineWidth(1).stroke();

  // ── Totals ─────────────────────────────────────────────────────────────────
  y += 16;
  const totalsX = margin + contentW * 0.55;
  const totalsLabelW = contentW * 0.25;
  const totalsValW   = contentW * 0.20 - 10;

  const addTotalRow = (label, value, bold = false, highlight = false) => {
    if (highlight) {
      doc.rect(totalsX - 10, y - 4, contentW * 0.45 + 10, 28).fill(BLUE);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('white');
    } else {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? BLACK : GRAY);
    }
    doc.text(label, totalsX, y, { width: totalsLabelW });
    doc.text(value, totalsX + totalsLabelW, y, { width: totalsValW, align: 'right' });
    y += highlight ? 28 : 20;
  };

  addTotalRow('Subtotal', formatCurrency(invoice.subtotal, invoice.currency));
  if (invoice.discount && invoice.discount > 0) {
    addTotalRow('Discount', `- ${formatCurrency(invoice.discount, invoice.currency)}`);
  }
  if (invoice.tax_rate && invoice.tax_rate > 0) {
    addTotalRow(`Tax (${invoice.tax_rate}%)`, formatCurrency(invoice.tax_amount, invoice.currency));
  }
  addTotalRow('TOTAL', formatCurrency(invoice.total, invoice.currency), true, true);

  // ── Bank details ───────────────────────────────────────────────────────────
  if (invoice.bank_name || invoice.bank_account || invoice.bank_swift) {
    y += 20;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('BANK DETAILS', margin, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY);
    if (invoice.bank_name)    { doc.text(`Bank: ${invoice.bank_name}`, margin, y);    y += 13; }
    if (invoice.bank_account) { doc.text(`Account: ${invoice.bank_account}`, margin, y); y += 13; }
    if (invoice.bank_swift)   { doc.text(`SWIFT: ${invoice.bank_swift}`, margin, y);  y += 13; }
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    y += 16;
    doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text('NOTES', margin, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
       .text(invoice.notes, margin, y, { width: contentW });
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = doc.page.height - 40;
  doc.rect(0, footerY, pageW, 40).fill(LGRAY);
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
     .text(
       `Generated by Bibix · ${new Date().toLocaleDateString()}`,
       margin, footerY + 14, { width: contentW, align: 'center' }
     );

  doc.end();
});

// ── Format currency helper ────────────────────────────────────────────────
function formatCurrency(amount, currency) {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF ' };
  const sym = symbols[currency] || (currency ? currency + ' ' : '$');
  const num = (typeof amount === 'number' ? amount : 0).toFixed(2);
  return `${sym}${num}`;
}

module.exports = router;
