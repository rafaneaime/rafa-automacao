import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, sessionValue, checkPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  async function entrar(formData: FormData) {
    'use server';
    const senha = String(formData.get('senha') ?? '');

    if (!checkPassword(senha)) redirect('/login?erro=1');

    (await cookies()).set(SESSION_COOKIE, sessionValue(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect('/');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-1 text-2xl font-semibold">Painel</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Digite a senha definida em PANEL_PASSWORD.
      </p>

      <form action={entrar} className="flex flex-col gap-3">
        <input
          type="password"
          name="senha"
          autoFocus
          required
          placeholder="Senha"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-white"
        >
          Entrar
        </button>
        {erro && <p className="text-sm text-red-600">Senha incorreta.</p>}
      </form>
    </main>
  );
}
