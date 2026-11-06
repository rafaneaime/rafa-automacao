import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { isValidSignature, isValidVerifyToken } from '@/lib/signature';
import { parseEvents } from '@/lib/parse-event';
import { processEvent, type ProcessResult } from '@/lib/process-event';
import { summarizeResults } from '@/lib/webhook-summary';
import { liveDeps } from '@/lib/live-deps';
import { readWebhookBody } from '@/lib/webhook-body';
import { depois } from '@/lib/depois';
import {
  recordWebhookEvent,
  markWebhookProcessed,
} from '@/lib/repo/webhook-events';

// Obrigatório: node:crypto não existe no Edge runtime, e sem ele
// não há validação de HMAC.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * O trabalho adiado roda dentro desta mesma execução, e o teto de tempo da
 * função continua valendo para ele.
 *
 * Sem esta linha vale o padrão da hospedagem — 10 segundos no plano gratuito,
 * que é o que quem compra usa. O envio medido leva de 4 a 7 segundos, e o pior
 * caso registrado bateu 30,8: a Meta receberia a resposta rápida, e a DM seria
 * cortada no meio, deixando o evento sem `processed_at`. Sessenta é o teto do
 * plano gratuito, e cobre com folga o pior caso observado.
 */
export const maxDuration = 60;

/**
 * Grava a chegada antes de qualquer processamento.
 *
 * Se algo quebrar depois, o evento está salvo. Se o próprio insert falhar
 * (ex.: banco fora do ar), não existe linha pra marcar — loga no console e
 * devolve `null`, porque nada foi processado ainda e um 500 só faria o Meta
 * reentregar a mesma falha.
 */
async function registrarEntrada(rawBody: string, valid: boolean): Promise<number | null> {
  try {
    return await recordWebhookEvent(rawBody, valid);
  } catch (error) {
    console.error('webhook: falha ao gravar webhook_events', error);
    return null;
  }
}

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
  const rawBody = await readWebhookBody(request);
  if (rawBody === null) return new Response('Corpo muito grande', { status: 413 });
  const signature = request.headers.get('x-hub-signature-256');

  // env.igAppSecret() lança se IG_APP_SECRET não estiver definido. Isso não
  // pode escapar como 500: sem ele não dá pra validar a assinatura, mas o
  // evento ainda precisa ficar visível no Logs do painel, não sumir num 500
  // silencioso.
  let appSecret: string | null = null;
  let configError: string | null = null;
  try {
    appSecret = env.igAppSecret();
  } catch (error) {
    console.error('webhook: IG_APP_SECRET não configurado', error);
    configError = 'configuração ausente: IG_APP_SECRET não está definido';
  }

  const valid = appSecret !== null ? isValidSignature(rawBody, signature, appSecret) : false;

  /*
   * Recusada, mas não invisível.
   *
   * O corpo não entra no banco: ele não está autenticado, e guardar payload de
   * origem desconhecida é como um banco vira depósito de lixo de terceiro. Mas
   * a LINHA entra, com o motivo — porque "chegou e foi recusado" e "não chegou
   * nada" são diagnósticos opostos, e a tela de Logs é onde a pessoa procura a
   * diferença.
   *
   * O silêncio custou caro em 02/10/2026: uma instalação ficou com a lista de
   * eventos vazia, e a investigação foi parar no portal do Meta — enquanto a
   * resposta podia estar aqui, numa linha dizendo "assinatura inválida".
   */
  if (configError || !valid) {
    try {
      const marcador = await recordWebhookEvent('', false);
      await markWebhookProcessed(marcador, configError ?? 'assinatura inválida');
    } catch (error) {
      console.error('webhook: falha ao registrar entrega recusada', error);
    }
    if (configError) return new Response('Configuração ausente', { status: 401 });
    return new Response('Assinatura inválida', { status: 401 });
  }

  const eventId = await registrarEntrada(rawBody, valid);
  if (eventId === null) return new Response('EVENT_RECEIVED', { status: 200 });

  // Pro opt-in: captura durável ANTES de qualquer automação. Sem captura não
  // confirmamos a entrega; a reentrega é deduplicada pelo inbox e pelo pipeline.
  //
  // Esta parte fica ANTES da resposta de propósito, mesmo depois de o envio ter
  // saído dela (ver `depois`): são só escritas no banco, rápidas, e o 503 é o
  // que faz a Meta reentregar. Prometer durabilidade e responder 200 antes de
  // gravar seria mentir para quem está do outro lado.
  if (liveDeps.captureInbox) {
    try { await liveDeps.captureInbox(JSON.parse(rawBody)); }
    catch { return new Response('Não foi possível salvar a conversa.', { status: 503 }); }
  }

  /*
   * Daqui para baixo, o trabalho acontece depois de a resposta sair.
   *
   * O envio da DM são várias idas à Meta e levava de 4 a 7 segundos dentro
   * desta requisição — acima do que a Meta tolera, e foi o que a fazia espaçar
   * e depois parar de entregar comentário de live e resposta de story. O
   * porquê completo, com os números, está em `src/lib/depois.ts`.
   *
   * O evento já está gravado neste ponto: se a hospedagem interromper o que
   * roda depois, a linha continua nos Logs sem `processed_at` — "chegou e não
   * terminou", que é um diagnóstico, não um sumiço.
   */
  await depois(async () => {
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
    // e seguir: a resposta à Meta já saiu, e não há 500 que valha duplicar as
    // DMs já enviadas.
    try {
      await markWebhookProcessed(eventId, persistedError);
    } catch (error) {
      console.error('webhook: falha ao marcar evento processado', error);
    }
  });

  // Sempre 200 (menos assinatura inválida/configuração ausente): o evento já
  // está persistido, e devolver erro só faria o Meta reentregar o mesmo
  // trabalho.
  return new Response('EVENT_RECEIVED', { status: 200 });
}
