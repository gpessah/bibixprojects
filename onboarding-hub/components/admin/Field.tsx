export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function FormStatus({ saved }: { saved?: boolean }) {
  if (!saved) return null;
  return (
    <div className="text-sm rounded-md p-3 border border-emerald-900/50 bg-emerald-950/30 text-emerald-300">
      Saved.
    </div>
  );
}
