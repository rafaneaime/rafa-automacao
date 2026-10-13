import { NextResponse } from 'next/server';
import { validarCriacaoDeChave } from '@/lib/api/rotulos';
import { isLoggedIn } from '@/lib/auth';
import { getFirstAccount } from '@/lib/repo/accounts';
import { criarChave, revogarChave } from '@/lib/repo/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function lerCorpo(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ ok: false, erro: 'Sessão necessária.' }, { status: 401 });
  }

  const account = await getFirstAccount();
  if (!account) {
    return NextResponse.json(
      { ok: false, erro: 'Conecte sua conta do Instagram antes de criar uma chave.' },
      { status: 400 },
    );
  }

  const validacao = validarCriacaoDeChave(await lerCorpo(request));
  if (!validacao.ok) {
    return NextResponse.json(
      { ok: false, erro: validacao.erro },
      { status: 400 },
    );
  }

  const criada = await criarChave(
    account.id,
    validacao.nome,
    validacao.escopos,
  );

  // A única resposta do sistema inteiro que carrega a chave em claro. O
  // `no-store` é explícito: resposta de POST não costuma ser cacheada, mas
  // "não costuma" não é garantia quando o que está dentro é um segredo.
  return NextResponse.json(
    { ok: true, chave: criada.chave, prefixo: criada.prefixo },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function DELETE(request: Request) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ ok: false, erro: 'Sessão necessária.' }, { status: 401 });
  }

  const account = await getFirstAccount();
  if (!account) {
    return NextResponse.json(
      { ok: false, erro: 'Conecte sua conta do Instagram antes de revogar uma chave.' },
      { status: 400 },
    );
  }

  const corpo = await lerCorpo(request);
  const id =
    typeof corpo === 'object' && corpo !== null && !Array.isArray(corpo)
      ? (corpo as Record<string, unknown>).id
      : null;

  if (typeof id !== 'number' || !Number.isSafeInteger(id)) {
    return NextResponse.json(
      { ok: false, erro: 'O id da chave é inválido.' },
      { status: 400 },
    );
  }

  await revogarChave(account.id, id);
  return NextResponse.json({ ok: true });
}

