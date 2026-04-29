import { X, Printer } from 'lucide-react';

const API_BASE = window.location.origin + '/api';
const PUBLIC_BASE = window.location.origin;

// ── Print-only styles injected once ──────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body > *:not(#bibix-integration-guide-print) { display: none !important; }
  #bibix-integration-guide-print {
    display: block !important;
    position: fixed;
    inset: 0;
    overflow: visible;
    background: white;
    z-index: 99999;
  }
  .no-print { display: none !important; }
  pre, code { font-size: 11px !important; }
  @page { margin: 18mm 16mm; }
}
`;

function injectPrintStyle() {
  if (document.getElementById('bibix-ig-print-style')) return;
  const s = document.createElement('style');
  s.id = 'bibix-ig-print-style';
  s.textContent = PRINT_STYLE;
  document.head.appendChild(s);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-gray-800 mb-3 pb-1.5 border-b border-gray-200">{title}</h2>
      {children}
    </section>
  );
}

function CodeBlock({ lang, children }: { lang?: string; children: string }) {
  return (
    <pre className="bg-gray-950 text-gray-100 rounded-xl p-4 text-xs leading-relaxed font-mono overflow-x-auto whitespace-pre-wrap break-words my-2">
      <code>{children.trim()}</code>
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 my-2">{children}</p>
  );
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="py-1.5 pr-4 font-mono text-xs text-gray-600 whitespace-nowrap align-top">{name}</td>
      <td className="py-1.5 text-xs text-gray-700 align-top">{children}</td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function IntegrationGuide({ onClose }: { onClose: () => void }) {
  const handlePrint = () => {
    injectPrintStyle();
    // Give browser a tick to apply the style sheet before printing
    requestAnimationFrame(() => window.print());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        id="bibix-integration-guide-print"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0 no-print">
          <div>
            <h1 className="text-base font-bold text-gray-800">CRM Integration Guide</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Everything you need to embed forms, pass hidden parameters, and push leads via API.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <Printer size={14} /> Print / Download PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 text-sm text-gray-700">

          {/* ── 1. Form Embed ── */}
          <Section title="1. Embed a Form on Your Website">
            <p className="mb-2">
              Every Bibix form can be embedded on any external website using a single
              JavaScript snippet. Go to <strong>CRM → Forms</strong>, open a form, and click
              the <strong>Embed Code</strong> button (<code className="bg-gray-100 px-1 rounded">&lt;/&gt;</code>).
            </p>
            <p className="mb-2">The snippet creates a self-contained form inside a <code className="bg-gray-100 px-1 rounded">&lt;div&gt;</code> tag:</p>
            <CodeBlock>{`<!-- Place where you want the form -->
<div id="bf-FORM_ID"></div>

<!-- Place before </body> -->
<script src="…"></script>`}</CodeBlock>
            <Note>
              You can also use the standalone form URL:{' '}
              <code className="bg-blue-100 px-1 rounded">{PUBLIC_BASE}/form/FORM_ID</code>
              {' '}— works as a direct link or inside an <code>&lt;iframe&gt;</code>.
            </Note>
          </Section>

          {/* ── 2. Hidden Field Parameters ── */}
          <Section title="2. Hidden Fields & URL Parameters">
            <p className="mb-2">
              Hidden fields let you capture tracking data (UTM params, affiliate IDs, etc.)
              without showing extra inputs to the visitor. Configure them in the form editor
              under the <strong>Hidden (URL Params)</strong> tab.
            </p>
            <p className="mb-3">
              Each hidden field maps a <em>CRM field key</em> to a <em>URL parameter name</em>.
              When a visitor arrives via a URL that contains those parameters, the values are
              read automatically and included in the form submission — the visitor never sees them.
            </p>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Example</h3>
            <p className="mb-1 text-xs text-gray-600">
              Suppose you map the CRM field <code className="bg-gray-100 px-1 rounded">utm_campaign</code> to the
              URL param <code className="bg-gray-100 px-1 rounded">campaign</code> and
              <code className="bg-gray-100 px-1 rounded">affiliate</code> to{' '}
              <code className="bg-gray-100 px-1 rounded">aff</code>. Then link to:
            </p>
            <CodeBlock>{`${PUBLIC_BASE}/form/FORM_ID?campaign=summer-promo&aff=partner42`}</CodeBlock>
            <p className="text-xs text-gray-600 mt-1 mb-2">
              When the visitor submits the form, the contact record will automatically include
              <code className="bg-gray-100 px-1 rounded mx-1">utm_campaign = "summer-promo"</code> and
              <code className="bg-gray-100 px-1 rounded mx-1">affiliate = "partner42"</code>.
            </p>

            <Note>
              The same URL parameter approach works for the embedded snippet — URL parameters
              are read from <code>window.location.search</code> of the page that hosts the snippet.
            </Note>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mt-4 mb-2">Common hidden-field mappings</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-4 py-2 font-semibold">CRM Field Key</th>
                    <th className="px-4 py-2 font-semibold">Suggested URL Param</th>
                    <th className="px-4 py-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['utm_source',   'utm_source',   'Traffic source (google, facebook…)'],
                    ['utm_medium',   'utm_medium',   'Medium (cpc, email, social…)'],
                    ['utm_campaign', 'utm_campaign', 'Campaign name or ID'],
                    ['utm_content',  'utm_content',  'Ad variant / creative'],
                    ['utm_term',     'utm_term',     'Paid keyword'],
                    ['affiliate',    'aff',          'Affiliate / partner identifier'],
                    ['referrer',     'ref',          'Referrer URL or code'],
                  ].map(([key, param, desc]) => (
                    <tr key={key}>
                      <td className="px-4 py-2 font-mono text-gray-700">{key}</td>
                      <td className="px-4 py-2 font-mono text-blue-600">{param}</td>
                      <td className="px-4 py-2 text-gray-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── 3. REST API – Form Submission ── */}
          <Section title="3. REST API — Form Submission Endpoint">
            <p className="mb-2">
              You can submit leads directly to a form via HTTP POST — useful for server-side
              integrations, custom landing-page scripts, or mobile apps.
            </p>

            <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
              <table className="w-full">
                <tbody>
                  <Field name="Endpoint">
                    <code className="text-blue-700 break-all">{API_BASE}/crm/forms/<em>FORM_ID</em>/submit</code>
                  </Field>
                  <Field name="Method"><code>POST</code></Field>
                  <Field name="Auth">None (public endpoint)</Field>
                  <Field name="Content-Type"><code>application/json</code></Field>
                </tbody>
              </table>
            </div>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Request body</h3>
            <CodeBlock>{`{
  "values": {
    "first_name": "Alice",
    "last_name":  "Smith",
    "email":      "alice@example.com",
    "phone":      "+44 7700 900123",
    "utm_campaign": "summer-promo",   // hidden field
    "affiliate":    "partner42"       // hidden field
  }
}`}</CodeBlock>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 mt-3">Response</h3>
            <CodeBlock>{`{ "success": true, "contact_id": "uuid-…", "redirect_url": null }`}</CodeBlock>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 mt-4">curl example</h3>
            <CodeBlock>{`curl -X POST "${API_BASE}/crm/forms/FORM_ID/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "values": {
      "first_name": "Alice",
      "email":      "alice@example.com",
      "utm_campaign": "summer-promo"
    }
  }'`}</CodeBlock>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 mt-4">JavaScript (fetch) example</h3>
            <CodeBlock>{`const res = await fetch("${API_BASE}/crm/forms/FORM_ID/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    values: {
      first_name: "Alice",
      email:      "alice@example.com",
      utm_campaign: new URLSearchParams(location.search).get("campaign") ?? "",
    },
  }),
});
const json = await res.json();
if (json.success) console.log("Contact ID:", json.contact_id);`}</CodeBlock>
          </Section>

          {/* ── 4. REST API – Lead Ingestion (API Key) ── */}
          <Section title="4. REST API — Lead Ingestion (API Key Auth)">
            <p className="mb-2">
              For server-to-server integrations (e.g. a CRM webhook, a third-party ad platform,
              or a backend service) use the authenticated ingest endpoint.  Generate an API key
              in <strong>CRM → API</strong>.
            </p>

            <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
              <table className="w-full">
                <tbody>
                  <Field name="Endpoint"><code className="text-blue-700">{API_BASE}/crm/ingest</code></Field>
                  <Field name="Method"><code>POST</code></Field>
                  <Field name="Auth"><code>Authorization: Bearer YOUR_API_KEY</code> <em>(or</em> <code>X-Api-Key</code><em>)</em></Field>
                </tbody>
              </table>
            </div>

            <CodeBlock>{`curl -X POST "${API_BASE}/crm/ingest" \\
  -H "Authorization: Bearer bx_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "values": {
      "first_name":   "Bob",
      "email":        "bob@example.com",
      "utm_campaign": "google-cpc"
    },
    "source": "google-ads"
  }'`}</CodeBlock>

            <Note>
              You can also pass field values as top-level body keys (without wrapping in{' '}
              <code>values</code>) — the endpoint flattens them automatically. Reserved keys
              (<code>api_key</code>, <code>values</code>, <code>assigned_to</code>,{' '}
              <code>team_id</code>, <code>source</code>) are never treated as field values.
            </Note>

            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 mt-3">Optional body fields</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <tbody>
                  <Field name="assigned_to">User ID to assign the contact to (string, optional)</Field>
                  <Field name="team_id">Team ID to assign the contact to (string, optional)</Field>
                  <Field name="source">Custom source label — defaults to <code>"api"</code></Field>
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── 5. Webhooks ── */}
          <Section title="5. Webhooks (Outbound)">
            <p className="mb-2 text-gray-500 italic">
              Outbound webhooks are not yet configured in this version of Bibix. You can
              implement them by polling the contacts endpoint or using the API key ingest
              endpoint to push data in from external platforms.
            </p>
            <Note>
              Tip: To receive a notification when a form is submitted, set a{' '}
              <strong>Redirect URL</strong> on the form (Settings tab) — the embed will redirect
              the visitor to your URL after a successful submission. Your server can handle that
              redirect as an implicit "conversion" signal.
            </Note>
          </Section>

          {/* ── 6. Contacts API ── */}
          <Section title="6. Contacts REST API (Authenticated)">
            <p className="mb-2">
              The full contacts API requires a logged-in session token (Bearer JWT).  Use it
              from the Bibix app or from trusted back-office tools.
            </p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Method</th>
                    <th className="px-4 py-2 font-semibold">Endpoint</th>
                    <th className="px-4 py-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    ['GET',    '/crm/contacts',         'List contacts (supports search, filter, sort, page)'],
                    ['POST',   '/crm/contacts',         'Create a contact manually'],
                    ['GET',    '/crm/contacts/:id',     'Get single contact'],
                    ['PUT',    '/crm/contacts/:id',     'Update contact fields / assignment'],
                    ['DELETE', '/crm/contacts/:id',     'Delete a contact'],
                    ['GET',    '/crm/forms',            'List forms'],
                    ['GET',    '/crm/forms/:id/public', 'Public form definition (no auth)'],
                    ['POST',   '/crm/forms/:id/submit', 'Submit a form entry (no auth)'],
                    ['POST',   '/crm/ingest',           'Ingest a lead via API key'],
                  ].map(([method, path, desc]) => (
                    <tr key={path}>
                      <td className="px-4 py-2 font-mono font-bold text-purple-700">{method}</td>
                      <td className="px-4 py-2 font-mono text-blue-700">{path}</td>
                      <td className="px-4 py-2 text-gray-500">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <p className="text-xs text-gray-400 text-center pt-2 pb-4">
            Bibix CRM — Integration Guide — {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
