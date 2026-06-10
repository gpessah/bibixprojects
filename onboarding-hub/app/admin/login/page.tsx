import { redirect } from 'next/navigation';
import { createSession, getSession, verifyCredentials } from '@/lib/auth';

async function loginAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const user = await verifyCredentials(email, password);
  if (!user) {
    redirect('/admin/login?error=1');
  }
  await createSession({ sub: user.id, email: user.email });
  redirect('/admin');
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getSession();
  if (session) redirect('/admin');

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form action={loginAction} className="card p-8 w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted mt-1 text-sm">Admin access to the onboarding hub.</p>

        {searchParams.error && (
          <div className="mt-4 text-sm rounded-md p-3 border border-red-900/50 bg-red-950/30 text-red-300">
            Invalid email or password.
          </div>
        )}

        <div className="mt-5">
          <label className="label">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="you@company.com"
          />
        </div>
        <div className="mt-4">
          <label className="label">Password</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
          />
        </div>
        <button type="submit" className="btn w-full justify-center mt-6">
          Sign in
        </button>
      </form>
    </main>
  );
}
