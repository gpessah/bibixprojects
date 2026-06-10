import { Sparkles } from 'lucide-react';

export function AskAnythingCard({ companyName }: { companyName: string }) {
  return (
    <div className="card p-6 md:p-7">
      <span className="chip">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
        Platform AI
      </span>
      <h3 className="mt-4 text-2xl font-semibold">Ask Anything</h3>
      <p className="mt-1 text-muted text-sm">
        Search the handbook, policies, and APIs at {companyName}.
      </p>
      <form className="mt-4 flex gap-2">
        <input
          className="input"
          placeholder="How do I request time off?"
          aria-label="Ask anything"
          disabled
        />
        <button type="button" className="btn" disabled title="Wire this up to your AI later">
          Ask
        </button>
      </form>
      <p className="mt-2 text-xs text-muted">
        Hook this up to your internal AI in <code>components/AskAnythingCard.tsx</code>.
      </p>
    </div>
  );
}
