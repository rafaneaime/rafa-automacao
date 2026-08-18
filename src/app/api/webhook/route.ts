import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { isValidSignature, isValidVerifyToken } from '@/lib/signature';
import { parseEvents } from '@/lib/parse-event';
import { processEvent, type ProcessResult } from '@/lib/process-event';
import { summarizeResults } from '@/lib/webhook-summary';
import { liveDeps } from '@/lib/live-deps';
import {
  recordWebhookEvent,
  markWebhookProcessed,
} from '@/lib/repo/webhook-events';

// Obrigatório: node:crypto não existe no Edge runtime, e sem ele
// não há validação de HMAC.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  if (mode === 'subscribe' && challenge && isValidVerifyToken(token, env.verifyToken())) {
    // O Meta espera o challenge cru, sem aspas e sem JSON.
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  return new Response('Acesso negado', { status: 403 });
}

export async function POST(request: NextRequest) {
  // Corpo CRU antes de qualquer parse: o HMAC é calculado sobre os bytes
  // exatos que o Meta enviou.
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  // env.igAppSecret() lança se IG_APP_SECRET não estiver definido. Isso não
  // pode escapar como 500: sem ele não dá pra validar a assinatura, mas o
  // evento ainda precisa ficar visível no Logs do painel, não sumir num 500
  // silencioso.
  let appSecret: string | null = null;
  let configError: string | null = null;
  try {
    appSecret = env.igAppSecret();
  } catch {
    configError = 'configuração ausente: IG_APP_SECRET não está definido';
  }

  const valid = appSecret !== null ? isValidSignature(rawBody, signature, appSecret) : false;

  // Persistir antes de processar: se algo quebrar depois, o evento está salvo.
  // Se o próprio insert falhar (ex.: banco fora do ar), não existe linha pra
  // marcar — loga no console e devolve 200, porque nada foi processado ainda
  // e um 500 só faria o Meta reentregar a mesma falha.
  let eventId: number | null = null;
  try {
    eventId = await recordWebhookEvent(rawBody, valid);
  } catch (error) {
    console.error('webhook: falha ao gravar webhook_events', error);
    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  if (configError) {
    try {
      await markWebhookProcessed(eventId, configError);
    } catch (error) {
      console.error('webhook: falha ao marcar erro de configuração', error);
    }
    return new Response('Configuração ausente', { status: 401 });
  }

  if (!valid) {
    try {
      await markWebhookProcessed(eventId, 'assinatura inválida');
    } catch (error) {
      console.error('webhook: falha ao marcar assinatura inválida', error);
    }
    return new Response('Assinatura inválida', { status: 401 });
  }

  const results: ProcessResult[] = [];
  let parseError: string | null = null;

  try {
    for (const event of parseEvents(JSON.parse(rawBody))) {
      results.push(await processEvent(event, liveDeps));
    }
  } catch (error) {
    parseError = String(error);
  }

  // Persiste todo outcome, não só erro — inclusive ignored/duplicate/
  // throttled, prefixados pra não parecer falha (ver summarizeResults).
  const summary = summarizeResults(results);
  const persistedError =
    parseError && summary ? `${parseError} | ${summary}` : (parseError ?? summary);

  // Os envios (sends) já aconteceram nesse ponto. Se o update falhar, logar
  // e devolver 200 mesmo assim: um 500 aqui faria o Meta reentregar o
  // webhook inteiro e duplicar as DMs já enviadas.
  try {
    await markWebhookProcessed(eventId, persistedError);
  } catch (error) {
    console.error('webhook: falha ao marcar evento processado', error);
  }

  // Sempre 200 (menos assinatura inválida/configuração ausente): o evento já
  // está persistido, e devolver erro só faria o Meta reentregar o mesmo
  // trabalho.
  return new Response('EVENT_RECEIVED', { status: 200 });
}
