import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../api/client';
import FieldRenderer from '../components/crm/FieldRenderer';
import type { CRMField, HiddenField } from '../store/crmStore';

interface PublicForm {
  id: string;
  name: string;
  description: string;
  settings: { redirect_url?: string; success_message?: string; button_text?: string };
}

type State = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

export default function PublicFormPage() {
  const { formId } = useParams<{ formId: string }>();
  const [state, setState] = useState<State>('loading');
  const [form, setForm] = useState<PublicForm | null>(null);
  const [fields, setFields] = useState<CRMField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  // Hidden field values read from URL params — sent on submit but never displayed
  const [hiddenValues, setHiddenValues] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    api.get(`/crm/forms/${formId}/public`)
      .then(({ data }) => {
        setForm(data.form);
        setFields(data.fields);

        // Resolve hidden field values from current URL query params
        const urlParams = new URLSearchParams(window.location.search);
        const hiddenFields: HiddenField[] = data.hidden_fields ?? [];
        const resolved: Record<string, string> = {};
        for (const hf of hiddenFields) {
          if (hf.field_key && hf.url_param) {
            const val = urlParams.get(hf.url_param);
            if (val !== null) resolved[hf.field_key] = val;
          }
        }
        setHiddenValues(resolved);

        setState('ready');
      })
      .catch(() => {
        setErrorMsg('This form is not available.');
        setState('error');
      });
  }, [formId]);

  const set = (key: string, val: string) => setValues(v => ({ ...v, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required
    const missing = fields.filter(f => f.required && !values[f.field_key]?.trim());
    if (missing.length) {
      setErrorMsg(`Please fill in: ${missing.map(f => f.name).join(', ')}`);
      return;
    }
    setErrorMsg('');
    setState('submitting');

    try {
      // Merge visible field values with silently-captured hidden field values
      const payload = { ...hiddenValues, ...values };
      const { data } = await api.post(`/crm/forms/${formId}/submit`, { values: payload });
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        setState('success');
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setState('ready');
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  // ── Error / not found ────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Form not found</h1>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <CheckCircle2 size={52} className="text-green-500 mx-auto mb-5" />
          <h1 className="text-2xl font-bold text-gray-800 mb-3">Thank you!</h1>
          <p className="text-gray-500">{form?.settings.success_message ?? "We'll be in touch."}</p>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">{form?.name}</h1>
          {form?.description && <p className="text-gray-500 mt-1.5 text-sm">{form.description}</p>}
        </div>

        {/* Fields */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {fields.map(field => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {field.name}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              <FieldRenderer
                field={field}
                value={values[field.field_key] ?? ''}
                onChange={val => set(field.field_key, val)}
              />
            </div>
          ))}

          {errorMsg && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />
              {errorMsg}
            </div>
          )}

          <button type="submit" disabled={state === 'submitting'}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
            {state === 'submitting' && <Loader2 size={16} className="animate-spin" />}
            {form?.settings.button_text ?? 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
