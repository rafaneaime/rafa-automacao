/**
 * O pedaço do protocolo MCP que este servidor implementa, sem dependência.
 *
 * Escolha registrada: **não usamos o SDK oficial.** O produto é self-hosted e
 * cada aluno roda a própria cópia; toda dependência vira superfície de
 * atualização e de quebra na instalação de outra pessoa. O que precisamos é um
 * subconjunto pequeno de JSON-RPC 2.0 sobre um POST — `initialize`,
 * `tools/list`, `tools/call` — e ele cabe aqui com teste próprio.
 *
 * O preço dessa escolha é conhecido: se o protocolo mudar, quem atualiza somos
 * nós. Por isso este arquivo declara qual revisão implementa, em vez de
 * aceitar qualquer coisa.
 */

/** Revisão que este servidor fala nativamente. */
export const VERSAO_ATUAL = '2026-07-28';

/**
 * Revisões anteriores que ainda respondemos.
 *
 * Elas usavam handshake de `initialize` e sessão por cabeçalho. O Claude Code
 * pode estar em qualquer uma delas, e recusar um cliente por estar seis meses
 * atrás seria trocar compatibilidade por pureza.
 */
export const VERSOES_ACEITAS = [
  VERSAO_ATUAL,
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
] as const;

export const CODIGO = {
  parseError: -32700,
  requisicaoInvalida: -32600,
  metodoDesconhecido: -32601,
  parametroInvalido: -32602,
  erroInterno: -32603,
  cabecalhoDivergente: -32020,
} as const;

export type Requisicao = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export function ehRequisicaoValida(valor: unknown): valor is Requisicao {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const r = valor as Record<string, unknown>;
  return r.jsonrpc === '2.0' && typeof r.method === 'string';
}

/** Notificação é requisição sem `id`. O transporte responde 202 e nada mais. */
export function ehNotificacao(requisicao: Requisicao): boolean {
  return requisicao.id === undefined || requisicao.id === null;
}

export function resposta(id: unknown, result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

export function erro(id: unknown, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

export type ProblemaDeCabecalho = { code: number; message: string; data?: unknown };

/**
 * A validação de cabeçalhos que a revisão 2026-07-28 exige.
 *
 * Ela existe por um motivo de segurança concreto: intermediários (balanceador,
 * gateway) roteiam pelo cabeçalho enquanto o servidor executa pelo corpo. Se
 * os dois divergirem, o que foi autorizado e o que foi executado são coisas
 * diferentes. Por isso divergência é erro, não algo a normalizar.
 *
 * Só vale para clientes de 2026-07-28 em diante: revisões anteriores não
 * definiam esses cabeçalhos, e exigi-los delas recusaria cliente legítimo.
 */
export function conferirCabecalhos(
  headers: Headers,
  requisicao: Requisicao,
): ProblemaDeCabecalho | null {
  const versao = headers.get('mcp-protocol-version');

  // Sem o cabeçalho, tratamos como cliente antigo — o que a própria
  // especificação permite. Ele não tem cabeçalho para conferir.
  if (!versao) return null;

  if (!(VERSOES_ACEITAS as readonly string[]).includes(versao)) {
    return {
      code: CODIGO.requisicaoInvalida,
      message: `Versão de protocolo não suportada: ${versao}.`,
      data: { supported: VERSOES_ACEITAS },
    };
  }

  if (versao !== VERSAO_ATUAL) return null;

  const metodo = headers.get('mcp-method');
  if (metodo !== requisicao.method) {
    return {
      code: CODIGO.cabecalhoDivergente,
      message: `Mcp-Method (${metodo ?? 'ausente'}) não bate com o método do corpo (${requisicao.method}).`,
    };
  }

  if (requisicao.method === 'tools/call') {
    const nomeNoCorpo = (requisicao.params?.name as string | undefined) ?? '';
    const nomeNoCabecalho = decodificarValorDeCabecalho(headers.get('mcp-name'));
    if (nomeNoCabecalho !== nomeNoCorpo) {
      return {
        code: CODIGO.cabecalhoDivergente,
        message: `Mcp-Name (${nomeNoCabecalho ?? 'ausente'}) não bate com o nome do corpo (${nomeNoCorpo}).`,
      };
    }
  }

  return null;
}

/**
 * Cabeçalho pode vir codificado quando o valor não cabe em ASCII puro. O
 * formato é `=?base64?<conteúdo>?=`, e comparar sem decodificar acusaria
 * divergência em nome legítimo com acento.
 */
export function decodificarValorDeCabecalho(valor: string | null): string | null {
  if (valor === null) return null;
  if (!valor.startsWith('=?base64?') || !valor.endsWith('?=')) return valor;

  const miolo = valor.slice('=?base64?'.length, -'?='.length);
  try {
    return Buffer.from(miolo, 'base64').toString('utf8');
  } catch {
    return valor;
  }
}

/** `localhost`, `127.0.0.1`, `[::1]` — com ou sem porta. */
/**
 * De onde o conector do Claude chama. Subdomínio conta: o pedido não sai do
 * navegador de ninguém, sai do servidor da Anthropic.
 */
const CASAS_DO_CLAUDE = ['claude.ai', 'claude.com'];

function daAnthropic(host: string): boolean {
  return CASAS_DO_CLAUDE.some((casa) => host === casa || host.endsWith(`.${casa}`));
}

/**
 * Outras origens que a instalação aceita, separadas por vírgula.
 *
 * Existe para que um cliente novo — outro painel, outro aplicativo de IA — não
 * dependa de um deploy meu para funcionar. Quem instalou acrescenta a origem
 * nas variáveis de ambiente e pronto.
 */
function origensDaInstalacao(): string[] {
  return (process.env.MCP_ORIGENS_PERMITIDAS ?? '')
    .split(',')
    .map((parte) => parte.trim().toLowerCase())
    .filter((parte) => parte.length > 0);
}

/**
 * Origem permitida, contra DNS rebinding.
 *
 * O ataque que a especificação descreve é concreto: uma página qualquer manda
 * o navegador resolver o domínio dela para 127.0.0.1 e falar com o servidor MCP
 * que roda na máquina de quem instalou. O `Origin` é a única coisa no pedido
 * que o atacante não escolhe — o navegador escreve, e por isso a conferência é
 * nele.
 *
 * Ela foi escrita como "mesma origem ou nada" e recusava o conector do Claude,
 * que chama do servidor da Anthropic com `Origin: https://claude.ai`. A
 * primeira correção deixou passar quando o app não estava em `localhost` — e
 * isso é errado: no rebinding o `Host` que chega é o domínio do atacante, então
 * a trava se desligava sozinha exatamente no caso que ela cobre. Decidir pelo
 * `Host` é decidir por um cabeçalho que vem de fora.
 *
 * Agora a lista é fechada e vive aqui dentro: mesma origem, as casas da
 * Anthropic, e o que a instalação acrescentar em `MCP_ORIGENS_PERMITIDAS`.
 * Qualquer outra é recusada, com ou sem `localhost` no meio.
 */
export function origemPermitida(origin: string | null, hostDoApp: string | null): boolean {
  // Cliente MCP de terminal não manda Origin, e exigi-lo recusaria justamente
  // quem vai usar isto. Quem pode omitir o cabeçalho também pode forjar
  // qualquer valor nele: a conferência só vale para quem é navegador, e para
  // esse a presença do `Origin` é obrigatória.
  if (!origin) return true;

  let endereco: URL;
  try {
    endereco = new URL(origin);
  } catch {
    return false; // Origin que nem URL é não merece o benefício da dúvida.
  }

  const host = endereco.host.toLowerCase();
  if (hostDoApp && host === hostDoApp.toLowerCase()) return true;
  if (daAnthropic(endereco.hostname.toLowerCase())) return true;

  const permitidas = origensDaInstalacao();
  return permitidas.includes(host) || permitidas.includes(endereco.origin.toLowerCase());
}
