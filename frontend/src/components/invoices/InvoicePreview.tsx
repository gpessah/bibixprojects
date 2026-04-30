import { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PreviewCompany {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  vat_number?: string;
  bank_name?: string;
  bank_account?: string;
  bank_swift?: string;
  logo_url?: string;
}

export interface PreviewClient {
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  vat_number?: string;
  contact_person?: string;
}

export interface PreviewItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface PreviewInvoice {
  invoice_number: string;
  issue_date: string;
  due_date?: string;
  status: string;
  currency: string;
  notes?: string;
  tax_rate: number;
  discount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  items: PreviewItem[];
  company: PreviewCompany;
  client: PreviewClient;
  template_id?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(amount: number, currency: string) {
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF ' };
  const sym = symbols[currency] || (currency + ' ');
  return `${sym}${(amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addressLines(obj: { address?: string; city?: string; country?: string; phone?: string; email?: string; vat_number?: string; contact_person?: string }) {
  const lines: string[] = [];
  if ((obj as any).contact_person) lines.push((obj as any).contact_person);
  if (obj.address) lines.push(obj.address);
  if (obj.city || obj.country) lines.push([obj.city, obj.country].filter(Boolean).join(', '));
  if (obj.phone) lines.push(obj.phone);
  if (obj.email) lines.push(obj.email);
  if (obj.vat_number) lines.push(`VAT: ${obj.vat_number}`);
  return lines;
}

// ── Template CSS ──────────────────────────────────────────────────────────────

const TEMPLATE_CSS: Record<number, string> = {
  // 1 — Classic
  1: `
    .inv-page { font-family: Georgia, 'Times New Roman', serif; background: #fff; color: #111; padding: 48px; max-width: 794px; margin: 0 auto; box-sizing: border-box; }
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 20px; margin-bottom: 28px; }
    .inv-company-name { font-size: 26px; font-weight: bold; color: #111; }
    .inv-company-sub { font-size: 12px; color: #555; margin-top: 4px; }
    .inv-label { font-size: 30px; font-weight: bold; letter-spacing: 4px; color: #111; text-align: right; }
    .inv-number { font-size: 13px; color: #555; text-align: right; margin-top: 4px; }
    .inv-status { display: inline-block; border: 1px solid #111; padding: 2px 10px; font-size: 11px; letter-spacing: 1px; margin-top: 6px; }
    .inv-meta { display: flex; gap: 32px; margin-bottom: 28px; }
    .inv-meta-block { }
    .inv-meta-key { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .inv-meta-val { font-size: 13px; font-weight: bold; }
    .inv-parties { display: flex; gap: 24px; margin-bottom: 32px; }
    .inv-party { flex: 1; border: 1px solid #ddd; padding: 16px; }
    .inv-party-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
    .inv-party-name { font-size: 14px; font-weight: bold; margin-bottom: 6px; }
    .inv-party-line { font-size: 12px; color: #555; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { border-top: 2px solid #111; border-bottom: 2px solid #111; }
    thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 8px 6px; text-align: left; }
    thead th:not(:first-child) { text-align: right; }
    tbody td { padding: 8px 6px; font-size: 12px; border-bottom: 1px solid #eee; }
    tbody td:not(:first-child) { text-align: right; }
    .inv-totals { display: flex; justify-content: flex-end; }
    .inv-totals-inner { width: 240px; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; border-bottom: 1px solid #eee; }
    .inv-total-final { display: flex; justify-content: space-between; padding: 8px 0; font-size: 16px; font-weight: bold; border-top: 2px solid #111; border-bottom: 2px solid #111; margin-top: 4px; }
    .inv-bank { margin-top: 28px; padding-top: 16px; border-top: 1px solid #ddd; }
    .inv-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 8px; }
    .inv-bank-line { font-size: 12px; color: #444; line-height: 1.7; }
    .inv-notes { margin-top: 20px; }
    .inv-notes-text { font-size: 12px; color: #555; line-height: 1.6; font-style: italic; }
  `,

  // 2 — Modern
  2: `
    .inv-page { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a1a; padding: 0; max-width: 794px; margin: 0 auto; box-sizing: border-box; overflow: hidden; }
    .inv-header { background: #0073ea; color: #fff; padding: 36px 48px; display: flex; justify-content: space-between; align-items: flex-start; }
    .inv-company-name { font-size: 24px; font-weight: 700; color: #fff; }
    .inv-company-sub { font-size: 12px; color: rgba(255,255,255,0.75); margin-top: 4px; }
    .inv-label { font-size: 28px; font-weight: 800; color: #fff; text-align: right; letter-spacing: 2px; }
    .inv-number { font-size: 13px; color: rgba(255,255,255,0.8); text-align: right; margin-top: 4px; }
    .inv-status { display: inline-block; background: rgba(255,255,255,0.2); color: #fff; padding: 3px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-top: 8px; }
    .inv-body { padding: 36px 48px; }
    .inv-meta { display: flex; gap: 28px; margin-bottom: 28px; background: #f0f7ff; border-radius: 10px; padding: 16px 20px; }
    .inv-meta-block { }
    .inv-meta-key { font-size: 10px; color: #0073ea; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 2px; }
    .inv-meta-val { font-size: 14px; font-weight: 600; color: #1a1a1a; }
    .inv-parties { display: flex; gap: 20px; margin-bottom: 32px; }
    .inv-party { flex: 1; }
    .inv-party-label { font-size: 10px; color: #0073ea; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 8px; }
    .inv-party-name { font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #1a1a1a; }
    .inv-party-line { font-size: 12px; color: #666; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border-radius: 8px; overflow: hidden; }
    thead tr { background: #0073ea; }
    thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 12px; text-align: left; color: #fff; font-weight: 600; }
    thead th:not(:first-child) { text-align: right; }
    tbody tr:nth-child(even) { background: #f8faff; }
    tbody td { padding: 10px 12px; font-size: 13px; color: #333; border-bottom: 1px solid #eef2ff; }
    tbody td:not(:first-child) { text-align: right; }
    .inv-totals { display: flex; justify-content: flex-end; }
    .inv-totals-inner { width: 260px; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #555; }
    .inv-total-final { display: flex; justify-content: space-between; padding: 12px 16px; font-size: 16px; font-weight: 700; background: #0073ea; color: #fff; border-radius: 8px; margin-top: 8px; }
    .inv-bank { margin-top: 28px; padding: 16px 20px; background: #f8faff; border-radius: 10px; }
    .inv-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #0073ea; font-weight: 700; margin-bottom: 8px; }
    .inv-bank-line { font-size: 12px; color: #444; line-height: 1.7; }
    .inv-notes { margin-top: 20px; }
    .inv-notes-text { font-size: 12px; color: #555; line-height: 1.6; }
  `,

  // 3 — Professional
  3: `
    .inv-page { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #2d3436; padding: 0; max-width: 794px; margin: 0 auto; box-sizing: border-box; }
    .inv-header { background: #2d3436; color: #fff; padding: 40px 48px 32px; display: flex; justify-content: space-between; align-items: flex-start; }
    .inv-company-name { font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
    .inv-company-sub { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 4px; }
    .inv-label { font-size: 32px; font-weight: 800; color: #fdcb6e; text-align: right; letter-spacing: 3px; }
    .inv-number { font-size: 13px; color: rgba(255,255,255,0.7); text-align: right; margin-top: 4px; }
    .inv-status { display: inline-block; border: 1px solid #fdcb6e; color: #fdcb6e; padding: 3px 12px; font-size: 11px; font-weight: 600; letter-spacing: 1px; margin-top: 8px; }
    .inv-body { padding: 36px 48px; }
    .inv-meta { display: flex; gap: 32px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
    .inv-meta-block { }
    .inv-meta-key { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
    .inv-meta-val { font-size: 13px; font-weight: 600; color: #2d3436; }
    .inv-parties { display: flex; gap: 24px; margin-bottom: 32px; }
    .inv-party { flex: 1; border-left: 3px solid #fdcb6e; padding-left: 14px; }
    .inv-party-label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; font-weight: 600; }
    .inv-party-name { font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #2d3436; }
    .inv-party-line { font-size: 12px; color: #636e72; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #2d3436; }
    thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; padding: 10px 12px; text-align: left; color: rgba(255,255,255,0.85); font-weight: 600; }
    thead th:not(:first-child) { text-align: right; }
    tbody tr:nth-child(even) { background: #f9f9f9; }
    tbody td { padding: 9px 12px; font-size: 12px; color: #2d3436; border-bottom: 1px solid #f0f0f0; }
    tbody td:not(:first-child) { text-align: right; }
    .inv-totals { display: flex; justify-content: flex-end; }
    .inv-totals-inner { width: 260px; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #636e72; }
    .inv-total-final { display: flex; justify-content: space-between; padding: 12px 16px; font-size: 16px; font-weight: 700; background: #2d3436; color: #fdcb6e; margin-top: 8px; }
    .inv-bank { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e0e0e0; }
    .inv-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #999; font-weight: 600; margin-bottom: 8px; }
    .inv-bank-line { font-size: 12px; color: #636e72; line-height: 1.7; }
    .inv-notes { margin-top: 20px; }
    .inv-notes-text { font-size: 12px; color: #636e72; line-height: 1.6; }
  `,

  // 4 — Minimal
  4: `
    .inv-page { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #333; padding: 56px 64px; max-width: 794px; margin: 0 auto; box-sizing: border-box; }
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
    .inv-company-name { font-size: 15px; font-weight: 600; color: #111; letter-spacing: 0.3px; }
    .inv-company-sub { font-size: 11px; color: #aaa; margin-top: 2px; }
    .inv-label { font-size: 11px; font-weight: 400; color: #bbb; letter-spacing: 3px; text-transform: uppercase; text-align: right; }
    .inv-number { font-size: 32px; font-weight: 300; color: #ddd; text-align: right; margin-top: 2px; letter-spacing: -1px; }
    .inv-status { font-size: 10px; color: #aaa; text-align: right; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px; display: block; }
    .inv-meta { display: flex; gap: 36px; margin-bottom: 40px; padding-bottom: 28px; border-bottom: 1px solid #f0f0f0; }
    .inv-meta-block { }
    .inv-meta-key { font-size: 9px; color: #bbb; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 3px; }
    .inv-meta-val { font-size: 12px; color: #333; }
    .inv-parties { display: flex; gap: 32px; margin-bottom: 40px; }
    .inv-party { flex: 1; }
    .inv-party-label { font-size: 9px; color: #bbb; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; }
    .inv-party-name { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #111; }
    .inv-party-line { font-size: 11px; color: #999; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    thead th { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; padding: 0 0 10px; text-align: left; color: #bbb; font-weight: 400; border-bottom: 1px solid #eee; }
    thead th:not(:first-child) { text-align: right; }
    tbody td { padding: 12px 0; font-size: 12px; color: #444; border-bottom: 1px solid #f5f5f5; }
    tbody td:not(:first-child) { text-align: right; }
    .inv-totals { display: flex; justify-content: flex-end; }
    .inv-totals-inner { width: 220px; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; color: #999; }
    .inv-total-final { display: flex; justify-content: space-between; padding: 12px 0; font-size: 15px; font-weight: 600; color: #111; border-top: 1px solid #eee; margin-top: 6px; }
    .inv-bank { margin-top: 40px; }
    .inv-section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #bbb; margin-bottom: 10px; }
    .inv-bank-line { font-size: 11px; color: #999; line-height: 1.8; }
    .inv-notes { margin-top: 24px; }
    .inv-notes-text { font-size: 11px; color: #aaa; line-height: 1.7; }
  `,

  // 5 — Bold
  5: `
    .inv-page { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; padding: 0; max-width: 794px; margin: 0 auto; box-sizing: border-box; display: flex; min-height: 600px; }
    .inv-sidebar { width: 8px; background: #ff6b35; flex-shrink: 0; }
    .inv-main { flex: 1; padding: 44px 48px; }
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid #111; }
    .inv-company-name { font-size: 22px; font-weight: 900; color: #111; text-transform: uppercase; letter-spacing: 1px; }
    .inv-company-sub { font-size: 11px; color: #888; margin-top: 4px; }
    .inv-label { font-size: 36px; font-weight: 900; color: #ff6b35; text-align: right; letter-spacing: -1px; }
    .inv-number { font-size: 13px; font-weight: 600; color: #888; text-align: right; margin-top: 2px; }
    .inv-status { display: inline-block; background: #111; color: #fff; padding: 4px 14px; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; }
    .inv-meta { display: flex; gap: 24px; margin-bottom: 28px; }
    .inv-meta-block { background: #f5f5f5; padding: 12px 16px; flex: 1; }
    .inv-meta-key { font-size: 9px; color: #999; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; margin-bottom: 3px; }
    .inv-meta-val { font-size: 13px; font-weight: 700; color: #111; }
    .inv-parties { display: flex; gap: 20px; margin-bottom: 32px; }
    .inv-party { flex: 1; }
    .inv-party-label { font-size: 9px; color: #ff6b35; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; margin-bottom: 8px; }
    .inv-party-name { font-size: 15px; font-weight: 800; margin-bottom: 5px; color: #111; }
    .inv-party-line { font-size: 12px; color: #666; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #111; }
    thead th { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; padding: 10px 12px; text-align: left; color: #fff; font-weight: 700; }
    thead th:not(:first-child) { text-align: right; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody td { padding: 10px 12px; font-size: 13px; color: #333; border-bottom: 2px solid #f0f0f0; }
    tbody td:not(:first-child) { text-align: right; }
    .inv-totals { display: flex; justify-content: flex-end; }
    .inv-totals-inner { width: 260px; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #777; }
    .inv-total-final { display: flex; justify-content: space-between; padding: 12px 16px; font-size: 18px; font-weight: 900; background: #ff6b35; color: #fff; margin-top: 8px; }
    .inv-bank { margin-top: 28px; padding: 16px; border: 2px solid #f0f0f0; }
    .inv-section-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: #ff6b35; font-weight: 700; margin-bottom: 8px; }
    .inv-bank-line { font-size: 12px; color: #555; line-height: 1.7; }
    .inv-notes { margin-top: 20px; }
    .inv-notes-text { font-size: 12px; color: #666; line-height: 1.6; }
  `,
};

// ── Invoice HTML renderer ─────────────────────────────────────────────────────

function renderInvoiceHTML(inv: PreviewInvoice, templateId: number): string {
  const tid = templateId >= 1 && templateId <= 5 ? templateId : 1;
  const css = TEMPLATE_CSS[tid];
  const isBold = tid === 5;

  const addrJoin = (lines: string[]) =>
    lines.map(l => `<div class="inv-party-line">${escHtml(l)}</div>`).join('');

  const companyLines = addressLines(inv.company);
  const clientLines  = addressLines(inv.client);

  const statusLabel = (inv.status || 'draft').toUpperCase();

  const headerInner = isBold ? `
    <div class="inv-header">
      <div>
        <div class="inv-company-name">${escHtml(inv.company.name)}</div>
        ${inv.company.email ? `<div class="inv-company-sub">${escHtml(inv.company.email)}</div>` : ''}
      </div>
      <div>
        <div class="inv-label">INVOICE</div>
        <div class="inv-number">#${escHtml(inv.invoice_number)}</div>
        <div class="inv-status">${statusLabel}</div>
      </div>
    </div>
  ` : `
    <div class="inv-header">
      <div>
        <div class="inv-company-name">${escHtml(inv.company.name)}</div>
        ${inv.company.email ? `<div class="inv-company-sub">${escHtml(inv.company.email)}</div>` : ''}
      </div>
      <div>
        <div class="inv-label">INVOICE</div>
        <div class="inv-number">#${escHtml(inv.invoice_number)}</div>
        <span class="inv-status">${statusLabel}</span>
      </div>
    </div>
  `;

  const metaBlock = `
    <div class="inv-meta">
      <div class="inv-meta-block">
        <div class="inv-meta-key">Issue Date</div>
        <div class="inv-meta-val">${escHtml(inv.issue_date)}</div>
      </div>
      ${inv.due_date ? `
      <div class="inv-meta-block">
        <div class="inv-meta-key">Due Date</div>
        <div class="inv-meta-val">${escHtml(inv.due_date)}</div>
      </div>` : ''}
      <div class="inv-meta-block">
        <div class="inv-meta-key">Currency</div>
        <div class="inv-meta-val">${escHtml(inv.currency)}</div>
      </div>
    </div>
  `;

  const partiesBlock = `
    <div class="inv-parties">
      <div class="inv-party">
        <div class="inv-party-label">From</div>
        <div class="inv-party-name">${escHtml(inv.company.name)}</div>
        ${addrJoin(companyLines)}
      </div>
      <div class="inv-party">
        <div class="inv-party-label">Bill To</div>
        <div class="inv-party-name">${escHtml(inv.client.name)}</div>
        ${addrJoin(clientLines)}
      </div>
    </div>
  `;

  const itemRows = inv.items.map((it, idx) => `
    <tr>
      <td>${escHtml(it.description || '')}</td>
      <td>${it.quantity}</td>
      <td>${fmtMoney(it.unit_price, inv.currency)}</td>
      <td>${fmtMoney(it.amount, inv.currency)}</td>
    </tr>
  `).join('');

  const tableBlock = `
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  `;

  const totalsBlock = `
    <div class="inv-totals">
      <div class="inv-totals-inner">
        <div class="inv-total-row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal, inv.currency)}</span></div>
        ${inv.discount > 0 ? `<div class="inv-total-row"><span>Discount</span><span>- ${fmtMoney(inv.discount, inv.currency)}</span></div>` : ''}
        ${inv.tax_rate > 0 ? `<div class="inv-total-row"><span>Tax (${inv.tax_rate}%)</span><span>${fmtMoney(inv.tax_amount, inv.currency)}</span></div>` : ''}
        <div class="inv-total-final"><span>TOTAL</span><span>${fmtMoney(inv.total, inv.currency)}</span></div>
      </div>
    </div>
  `;

  const bankBlock = (inv.company.bank_name || inv.company.bank_account || inv.company.bank_swift) ? `
    <div class="inv-bank">
      <div class="inv-section-label">Bank Details</div>
      ${inv.company.bank_name    ? `<div class="inv-bank-line">Bank: ${escHtml(inv.company.bank_name)}</div>` : ''}
      ${inv.company.bank_account ? `<div class="inv-bank-line">Account: ${escHtml(inv.company.bank_account)}</div>` : ''}
      ${inv.company.bank_swift   ? `<div class="inv-bank-line">SWIFT: ${escHtml(inv.company.bank_swift)}</div>` : ''}
    </div>
  ` : '';

  const notesBlock = inv.notes ? `
    <div class="inv-notes">
      <div class="inv-section-label">Notes</div>
      <div class="inv-notes-text">${escHtml(inv.notes)}</div>
    </div>
  ` : '';

  // Template 5 wraps differently (sidebar stripe layout)
  if (isBold) {
    return `
      <style>${css}
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      <div class="inv-page" id="invoice-content">
        <div class="inv-sidebar"></div>
        <div class="inv-main">
          ${headerInner}
          ${metaBlock}
          ${partiesBlock}
          ${tableBlock}
          ${totalsBlock}
          ${bankBlock}
          ${notesBlock}
        </div>
      </div>
    `;
  }

  // Templates 1-4: header may be full-width band or inline
  const needsBodyWrapper = tid === 2 || tid === 3;

  if (needsBodyWrapper) {
    return `
      <style>${css}
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      <div class="inv-page" id="invoice-content">
        ${headerInner}
        <div class="inv-body">
          ${metaBlock}
          ${partiesBlock}
          ${tableBlock}
          ${totalsBlock}
          ${bankBlock}
          ${notesBlock}
        </div>
      </div>
    `;
  }

  // Templates 1 & 4: everything inside the padded page
  return `
    <style>${css}
      @media print {
        @page { size: A4; margin: 10mm; }
        body { margin: 0; }
        .no-print { display: none !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
    <div class="inv-page" id="invoice-content">
      ${headerInner}
      ${metaBlock}
      ${partiesBlock}
      ${tableBlock}
      ${totalsBlock}
      ${bankBlock}
      ${notesBlock}
    </div>
  `;
}

function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── InvoicePreview component ──────────────────────────────────────────────────

interface InvoicePreviewProps {
  invoice: PreviewInvoice;
  onClose: () => void;
}

export default function InvoicePreview({ invoice, onClose }: InvoicePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const templateId = invoice.template_id ?? 1;

  // Scale-to-fit: measure rendered height and shrink if > A4 height at 96dpi
  useEffect(() => {
    const el = containerRef.current?.querySelector('#invoice-content') as HTMLElement | null;
    if (!el) return;
    // A4 at 96dpi = ~1122px; we use the container's visible width as scale basis
    const A4_HEIGHT = 1122;
    const naturalHeight = el.scrollHeight;
    if (naturalHeight > A4_HEIGHT) {
      const scale = A4_HEIGHT / naturalHeight;
      el.style.transform = `scale(${scale})`;
      el.style.transformOrigin = 'top left';
      // Collapse the extra space so it doesn't scroll weird
      (el.parentElement as HTMLElement).style.height = `${naturalHeight * scale}px`;
    }
  }, [invoice, templateId]);

  const handlePrint = () => {
    window.print();
  };

  const html = renderInvoiceHTML(invoice, templateId);

  return (
    <>
      {/* Print-only: render invoice directly into document so window.print() captures it */}
      <style>{`
        @media print {
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; position: fixed; inset: 0; z-index: 9999; }
        }
        @media screen {
          #print-root { display: none; }
        }
      `}</style>

      {/* Screen preview modal */}
      <div className="fixed inset-0 z-[60] flex flex-col bg-black/60">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">
              Invoice Preview — #{invoice.invoice_number}
            </span>
            <span className="text-xs text-gray-400 capitalize bg-gray-100 px-2 py-0.5 rounded-full">
              {['', 'Classic', 'Modern', 'Professional', 'Minimal', 'Bold'][templateId] || 'Classic'} template
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-monday-blue text-white text-sm font-medium rounded-lg hover:bg-blue-600"
            >
              <Printer size={14} /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto py-8 px-4 flex justify-center">
          <div
            ref={containerRef}
            className="bg-white shadow-2xl"
            style={{ width: '794px', minWidth: '794px' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      {/* Invisible print target — same HTML injected here for actual printing */}
      <div
        id="print-root"
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ display: 'none' }}
      />
    </>
  );
}

// ── Template thumbnail cards ──────────────────────────────────────────────────

const TEMPLATE_META = [
  {
    id: 1,
    name: 'Classic',
    preview: (
      <div style={{ fontFamily: 'Georgia, serif', padding: '8px', fontSize: '6px', lineHeight: 1.3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #111', paddingBottom: '4px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '9px' }}>COMPANY</span>
          <span style={{ fontWeight: 'bold', letterSpacing: '2px' }}>INVOICE</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
          <div style={{ flex: 1, border: '1px solid #ddd', padding: '3px', fontSize: '5px' }}><div style={{ color: '#888' }}>FROM</div>Client Name</div>
          <div style={{ flex: 1, border: '1px solid #ddd', padding: '3px', fontSize: '5px' }}><div style={{ color: '#888' }}>TO</div>Client Name</div>
        </div>
        <div style={{ background: '#f5f5f5', height: '3px', marginBottom: '2px' }} />
        <div style={{ background: '#f5f5f5', height: '3px', marginBottom: '2px' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ fontWeight: 'bold', fontSize: '7px', borderTop: '1px solid #111' }}>TOTAL: $0.00</div></div>
      </div>
    ),
  },
  {
    id: 2,
    name: 'Modern',
    preview: (
      <div style={{ fontFamily: 'sans-serif', fontSize: '6px', lineHeight: 1.3, overflow: 'hidden' }}>
        <div style={{ background: '#0073ea', color: '#fff', padding: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '8px' }}>COMPANY</span>
          <span style={{ fontWeight: 'bold', fontSize: '9px', letterSpacing: '1px' }}>INVOICE</span>
        </div>
        <div style={{ padding: '0 8px' }}>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            <div style={{ flex: 1, fontSize: '5px', color: '#555' }}>FROM block</div>
            <div style={{ flex: 1, fontSize: '5px', color: '#555' }}>TO block</div>
          </div>
          <div style={{ height: '3px', background: '#eef2ff', marginBottom: '2px' }} />
          <div style={{ height: '3px', background: '#eef2ff', marginBottom: '4px' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ background: '#0073ea', color: '#fff', padding: '2px 6px', fontSize: '6px', fontWeight: 'bold' }}>TOTAL $0.00</div></div>
        </div>
      </div>
    ),
  },
  {
    id: 3,
    name: 'Professional',
    preview: (
      <div style={{ fontFamily: 'sans-serif', fontSize: '6px', lineHeight: 1.3, overflow: 'hidden' }}>
        <div style={{ background: '#2d3436', color: '#fff', padding: '8px', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '8px' }}>COMPANY</span>
          <span style={{ fontWeight: 'bold', fontSize: '10px', color: '#fdcb6e', letterSpacing: '1px' }}>INVOICE</span>
        </div>
        <div style={{ padding: '0 8px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
            <div style={{ flex: 1, borderLeft: '2px solid #fdcb6e', paddingLeft: '4px', fontSize: '5px' }}>FROM</div>
            <div style={{ flex: 1, borderLeft: '2px solid #fdcb6e', paddingLeft: '4px', fontSize: '5px' }}>TO</div>
          </div>
          <div style={{ height: '3px', background: '#f5f5f5', marginBottom: '2px' }} />
          <div style={{ height: '3px', background: '#f5f5f5', marginBottom: '4px' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ background: '#2d3436', color: '#fdcb6e', padding: '2px 6px', fontSize: '6px', fontWeight: 'bold' }}>TOTAL $0.00</div></div>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    name: 'Minimal',
    preview: (
      <div style={{ fontFamily: 'sans-serif', padding: '8px', fontSize: '6px', lineHeight: 1.3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontWeight: '600', fontSize: '8px' }}>Company</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#ccc', fontSize: '5px', letterSpacing: '2px' }}>INVOICE</div>
            <div style={{ color: '#ddd', fontSize: '12px', lineHeight: 1 }}>#001</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '4px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
            <div style={{ flex: 1, color: '#aaa', fontSize: '5px' }}>From · To</div>
          </div>
          <div style={{ height: '1px', background: '#f5f5f5', marginBottom: '2px' }} />
          <div style={{ height: '1px', background: '#f5f5f5', marginBottom: '4px' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ fontWeight: '600', fontSize: '7px', borderTop: '1px solid #eee', paddingTop: '2px' }}>Total $0.00</div></div>
      </div>
    ),
  },
  {
    id: 5,
    name: 'Bold',
    preview: (
      <div style={{ fontFamily: 'sans-serif', fontSize: '6px', lineHeight: 1.3, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: '5px', background: '#ff6b35', flexShrink: 0 }} />
        <div style={{ flex: 1, padding: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '4px', marginBottom: '4px' }}>
            <span style={{ fontWeight: '900', fontSize: '8px', textTransform: 'uppercase' }}>COMPANY</span>
            <span style={{ fontWeight: '900', fontSize: '11px', color: '#ff6b35' }}>INVOICE</span>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
            <div style={{ flex: 1, background: '#f5f5f5', padding: '2px', fontSize: '5px' }}>FROM</div>
            <div style={{ flex: 1, background: '#f5f5f5', padding: '2px', fontSize: '5px' }}>TO</div>
          </div>
          <div style={{ height: '3px', background: '#fafafa', marginBottom: '2px' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ background: '#ff6b35', color: '#fff', padding: '2px 6px', fontSize: '6px', fontWeight: '900' }}>TOTAL $0.00</div></div>
        </div>
      </div>
    ),
  },
];

interface TemplateSelectorProps {
  value: number;
  onChange: (id: number) => void;
}

export function TemplateSelector({ value, onChange }: TemplateSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-2">Invoice Template</label>
      <div className="grid grid-cols-5 gap-2">
        {TEMPLATE_META.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              'rounded-lg overflow-hidden border-2 transition-all hover:shadow-md cursor-pointer',
              value === t.id ? 'border-monday-blue ring-2 ring-monday-blue/30' : 'border-gray-200 hover:border-gray-300',
            ].join(' ')}
          >
            <div className="h-20 bg-white overflow-hidden">
              {t.preview}
            </div>
            <div className={[
              'text-center text-xs py-1 font-medium',
              value === t.id ? 'bg-monday-blue text-white' : 'bg-gray-50 text-gray-600',
            ].join(' ')}>
              {t.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
