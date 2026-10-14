import { autenticar } from '@/lib/api/autenticar';
import {
  CODIGO,
  VERSAO_ATUAL,
  VERSOES_ACEITAS,
  conferirCabecalhos,
  ehNotificacao,
  ehRequisicaoValida,
  erro,
  origemPermitida,
  paraEstruturado,
  resposta,
  type Requisicao,
} from '@/lib/mcp/protocolo';
import { acharFerramenta, ferramentasParaEscopos, limiteDaFerramenta } from '@/lib/mcp/ferramentas';
import { executar } from '@/lib/mcp/executar';
import { validarCriacaoDeAutomacao } from '@/lib/mcp/criacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (corpo: unknown, status = 200) =>
  Response.json(corpo, { status, headers: { 'cache-control': 'no-store' } });

/**
 * A revisão 2026-07-28 removeu o stream por GET e a sessão por DELETE. Cliente
 * antigo que tentar isso recebe 405, que é o que a especificação manda — e o
 * 405 é justamente o sinal que faz ele cair para o caminho compatível.
 */
export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}
export const DELETE = GET;

export async function POST(request: Request) {
  if (!origemPermitida(request.headers.get('origin'), request.headers.get('host'))) {
    return json(
      erro(
        null,
        CODIGO.requisicaoInvalida,
        'Origem não permitida. Se este cliente é seu, acrescente a origem dele em ' +
          'MCP_ORIGENS_PERMITIDAS, nas variáveis de ambiente do projeto.',
      ),
      403,
    );
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return json(erro(null, CODIGO.parseError, 'Corpo não é JSON válido.'), 400);
  }

  if (!ehRequisicaoValida(corpo)) {
    return json(erro(null, CODIGO.requisicaoInvalida, 'Requisição JSON-RPC inválida.'), 400);
  }
  const requisicao: Requisicao = corpo;

  const problema = conferirCabecalhos(request.headers, requisicao);
  if (problema) {
    return json(erro(requisicao.id, problema.code, problema.message, problema.data), 400);
  }

  // Notificação não tem resposta. O handshake antigo manda
  // `notifications/initialized` e fica esperando o 202.
  if (ehNotificacao(requisicao)) {
    return new Response(null, { status: 202 });
  }

  // `initialize` acontece antes de qualquer trabalho e não expõe dado nenhum:
  // responder sem exigir chave deixa o cliente descobrir o servidor e falhar
  // com clareza na primeira chamada de verdade, em vez de falhar no aperto de
  // mão com uma mensagem que não ajuda ninguém.
  if (requisicao.method === 'initialize') {
    const pedida = (requisicao.params?.protocolVersion as string | undefined) ?? VERSAO_ATUAL;
    const versao = (VERSOES_ACEITAS as readonly string[]).includes(pedida)
      ? pedida
      : VERSAO_ATUAL;

    return json(
      resposta(requisicao.id, {
        protocolVersion: versao,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'adeus-mensalidade', version: '1.0.0' },
        instructions:
          'Painel de automação de Instagram desta pessoa: contatos, atividade e as ' +
          'automações que respondem comentários e mensagens. Chamadas de leitura não ' +
          'mudam nada. Criar e publicar automação muda: publicada, ela passa a mandar ' +
          'DM para seguidores de verdade — mostre o texto e confirme antes.',
      }),
    );
  }

  if (requisicao.method === 'tools/list') {
    const auth = await autenticar(request.headers, 'leitura');
    if (!auth.ok) {
      return json(erro(requisicao.id, CODIGO.requisicaoInvalida, auth.erro), auth.status);
    }
    return json(
      resposta(requisicao.id, {
        resultType: 'complete',
        tools: ferramentasParaEscopos(auth.contexto.escopos),
      }),
    );
  }

  if (requisicao.method !== 'tools/call') {
    const auth = await autenticar(request.headers, 'leitura');
    if (!auth.ok) {
      return json(erro(requisicao.id, CODIGO.requisicaoInvalida, auth.erro), auth.status);
    }
    return json(
      erro(requisicao.id, CODIGO.metodoDesconhecido, `Método desconhecido: ${requisicao.method}`),
      404,
    );
  }

  const ferramenta = acharFerramenta(requisicao.params?.name);
  if (!ferramenta) {
    // Exige chave antes de dizer que a ferramenta não existe. Sem isto, quem
    // não tem chave nenhuma descobre a lista inteira por tentativa: nome que
    // existe responde diferente de nome que não existe. Só `initialize`
    // responde sem chave, e ele não expõe nada.
    const semChave = await autenticar(request.headers, 'leitura');
    if (!semChave.ok) {
      return json(erro(requisicao.id, CODIGO.requisicaoInvalida, semChave.erro), semChave.status);
    }
    return json(
      erro(requisicao.id, CODIGO.parametroInvalido, `Ferramenta desconhecida: ${String(requisicao.params?.name)}`),
    );
  }

  const auth = await autenticar(request.headers, ferramenta.escopo);
  if (!auth.ok) {
    return json(erro(requisicao.id, CODIGO.requisicaoInvalida, auth.erro), auth.status);
  }
  const conta = auth.contexto.accountId;

  const args = (requisicao.params?.arguments as Record<string, unknown>) ?? {};
  const criacao = ferramenta.name === 'criar_automacao' ? validarCriacaoDeAutomacao(args) : null;
  if (criacao && !criacao.ok) {
    return json(erro(requisicao.id, CODIGO.parametroInvalido, criacao.erro));
  }
  const limite = limiteDaFerramenta(args.limite);

  try {
    const dados = await executar(ferramenta.name, {
      conta,
      chaveId: auth.contexto.chaveId,
      args,
      limite,
      criacao: criacao?.ok ? criacao.dados : undefined,
    });
    return json(
      resposta(requisicao.id, {
        resultType: 'complete',
        // O texto vai junto do dado estruturado de propósito: alguns clientes
        // só mostram `content`, e um resultado invisível é um resultado que o
        // modelo não usa.
        content: [{ type: 'text', text: JSON.stringify(dados, null, 2) }],
        structuredContent: paraEstruturado(dados),
        isError: false,
      }),
    );
  } catch (falha) {
    // Erro de execução vai no resultado com isError, não como erro de
    // protocolo: assim o modelo lê o que houve e pode corrigir a chamada,
    // em vez de receber uma falha opaca.
    console.error('mcp: falha ao executar ferramenta', ferramenta.name, falha);
    // O motivo vai junto quando é recusa nossa ("automação não encontrada",
    // "sem mensagem de DM escrita"): sem ele, o modelo tenta de novo igual, e
    // quem está conversando ouve "não consegui" três vezes sem saber por quê.
    const motivo = falha instanceof Error && falha.message ? ` ${falha.message}.` : '';
    return json(
      resposta(requisicao.id, {
        resultType: 'complete',
        content: [{ type: 'text', text: `Não consegui executar ${ferramenta.name}.${motivo}` }],
        isError: true,
      }),
    );
  }
}
