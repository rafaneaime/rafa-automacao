import { describe, expect, it } from 'vitest';
import {
  ehRequisicaoValida,
  ehNotificacao,
  conferirCabecalhos,
  decodificarValorDeCabecalho,
  origemPermitida,
  paraEstruturado,
  resposta,
  erro,
  CODIGO,
  VERSAO_ATUAL,
} from '@/lib/mcp/protocolo';
import { FERRAMENTAS, acharFerramenta, limiteDaFerramenta } from '@/lib/mcp/ferramentas';

const cab = (h: Record<string, string>) => new Headers(h);
const req = (over: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'tools/list',
  ...over,
});

describe('ehRequisicaoValida', () => {
  it('aceita requisição JSON-RPC bem formada', () => {
    expect(ehRequisicaoValida(req())).toBe(true);
  });

  it('recusa o que não é JSON-RPC 2.0', () => {
    expect(ehRequisicaoValida({ method: 'tools/list' })).toBe(false);
    expect(ehRequisicaoValida({ jsonrpc: '1.0', method: 'x' })).toBe(false);
    expect(ehRequisicaoValida({ jsonrpc: '2.0' })).toBe(false);
    expect(ehRequisicaoValida(null)).toBe(false);
    expect(ehRequisicaoValida([])).toBe(false);
    expect(ehRequisicaoValida('texto')).toBe(false);
  });
});

describe('ehNotificacao', () => {
  // Notificação não tem resposta, e o handshake antigo depende disso: o
  // cliente manda notifications/initialized e espera 202, não um resultado.
  it('reconhece ausência de id', () => {
    expect(ehNotificacao({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBe(true);
    expect(ehNotificacao({ jsonrpc: '2.0', id: null, method: 'x' })).toBe(true);
    expect(ehNotificacao(req())).toBe(false);
    expect(ehNotificacao({ jsonrpc: '2.0', id: 0, method: 'x' })).toBe(false);
  });
});

describe('conferirCabecalhos', () => {
  // Intermediários roteiam pelo cabeçalho e o servidor executa pelo corpo. Se
  // divergirem, o que foi autorizado e o que foi executado são coisas
  // diferentes — por isso divergência é erro, não algo a normalizar.
  it('acusa Mcp-Method diferente do corpo', () => {
    const p = conferirCabecalhos(
      cab({ 'mcp-protocol-version': VERSAO_ATUAL, 'mcp-method': 'tools/call' }),
      req(),
    );
    expect(p?.code).toBe(CODIGO.cabecalhoDivergente);
  });

  it('acusa Mcp-Name diferente do corpo em tools/call', () => {
    const p = conferirCabecalhos(
      cab({
        'mcp-protocol-version': VERSAO_ATUAL,
        'mcp-method': 'tools/call',
        'mcp-name': 'outra',
      }),
      req({ method: 'tools/call', params: { name: 'leads_quentes' } }),
    );
    expect(p?.code).toBe(CODIGO.cabecalhoDivergente);
  });

  it('aceita quando cabeçalho e corpo batem', () => {
    expect(
      conferirCabecalhos(
        cab({
          'mcp-protocol-version': VERSAO_ATUAL,
          'mcp-method': 'tools/call',
          'mcp-name': 'leads_quentes',
        }),
        req({ method: 'tools/call', params: { name: 'leads_quentes' } }),
      ),
    ).toBeNull();
  });

  // Revisões anteriores não definiam esses cabeçalhos. Exigi-los delas
  // recusaria cliente legítimo que está só alguns meses atrás.
  it('não exige cabeçalho de cliente antigo', () => {
    expect(conferirCabecalhos(cab({}), req())).toBeNull();
    expect(conferirCabecalhos(cab({ 'mcp-protocol-version': '2025-06-18' }), req())).toBeNull();
  });

  it('recusa versão que não falamos, dizendo quais falamos', () => {
    const p = conferirCabecalhos(cab({ 'mcp-protocol-version': '1999-01-01' }), req());
    expect(p?.message).toMatch(/não suportada/);
    expect(p?.data).toHaveProperty('supported');
  });
});

describe('decodificarValorDeCabecalho', () => {
  it('devolve ASCII simples como está', () => {
    expect(decodificarValorDeCabecalho('leads_quentes')).toBe('leads_quentes');
  });

  // Sem decodificar, um nome com acento acusaria divergência sendo legítimo.
  it('decodifica o formato base64 da especificação', () => {
    const codificado = `=?base64?${Buffer.from('audiência', 'utf8').toString('base64')}?=`;
    expect(decodificarValorDeCabecalho(codificado)).toBe('audiência');
  });

  it('devolve null quando o cabeçalho não existe', () => {
    expect(decodificarValorDeCabecalho(null)).toBeNull();
  });
});

describe('origemPermitida', () => {
  // Cliente MCP de terminal não manda Origin, e exigi-lo recusaria justamente
  // quem vai usar isto.
  it('aceita requisição sem Origin', () => {
    expect(origemPermitida(null, 'app.vercel.app')).toBe(true);
  });

  it('aceita mesma origem', () => {
    expect(origemPermitida('https://app.vercel.app', 'app.vercel.app')).toBe(true);
  });

  // O conector chama do servidor da Anthropic, com `Origin: https://claude.ai`.
  // Recusar isso deixava de fora o cliente que o produto existe para atender.
  it('aceita as casas da Anthropic, inclusive subdomínio', () => {
    expect(origemPermitida('https://claude.ai', 'app.vercel.app')).toBe(true);
    expect(origemPermitida('https://api.claude.com', 'app.vercel.app')).toBe(true);
  });

  // A lista não pode depender do `Host`: num ataque de DNS rebinding o `Host`
  // que chega é o domínio do atacante, e decidir por ele desligaria a trava
  // justamente no caso que ela cobre.
  it('recusa origem desconhecida, com ou sem localhost no Host', () => {
    expect(origemPermitida('https://site-do-atacante.com', 'app.vercel.app')).toBe(false);
    expect(origemPermitida('https://site-do-atacante.com', 'localhost:3000')).toBe(false);
    expect(origemPermitida('https://claude.ai.site-do-atacante.com', 'app.vercel.app')).toBe(false);
    expect(origemPermitida('https://site-do-atacante.com', null)).toBe(false);
  });

  it('aceita o que a instalação acrescentar em MCP_ORIGENS_PERMITIDAS', () => {
    const antes = process.env.MCP_ORIGENS_PERMITIDAS;
    process.env.MCP_ORIGENS_PERMITIDAS = 'https://meu-painel.com, outro.app';
    try {
      expect(origemPermitida('https://meu-painel.com', 'app.vercel.app')).toBe(true);
      expect(origemPermitida('https://outro.app', 'app.vercel.app')).toBe(true);
      expect(origemPermitida('https://terceiro.app', 'app.vercel.app')).toBe(false);
    } finally {
      if (antes === undefined) delete process.env.MCP_ORIGENS_PERMITIDAS;
      else process.env.MCP_ORIGENS_PERMITIDAS = antes;
    }
  });

  it('recusa Origin que nem URL é', () => {
    expect(origemPermitida('lixo', 'app.vercel.app')).toBe(false);
    expect(origemPermitida('lixo', 'localhost:3000')).toBe(false);
  });
});

describe('ferramentas', () => {
  it('toda ferramenta tem nome válido, título, descrição e schema', () => {
    for (const f of FERRAMENTAS) {
      expect(f.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(30);
      expect(f.inputSchema.type).toBe('object');
    }
  });

  it('não tem nome repetido', () => {
    const nomes = FERRAMENTAS.map((f) => f.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('acha por nome e recusa desconhecida', () => {
    expect(acharFerramenta('leads_quentes')?.name).toBe('leads_quentes');
    expect(acharFerramenta('nao_existe')).toBeNull();
    expect(acharFerramenta(null)).toBeNull();
    expect(acharFerramenta(42)).toBeNull();
  });

  // Pedir "todos" é o comportamento natural de um modelo, e uma base grande
  // numa resposta só estoura o contexto dele.
  it('limite tem padrão e teto', () => {
    expect(limiteDaFerramenta(undefined)).toBe(50);
    expect(limiteDaFerramenta(10)).toBe(10);
    expect(limiteDaFerramenta(99999)).toBe(200);
    expect(limiteDaFerramenta(0)).toBe(50);
    expect(limiteDaFerramenta(-1)).toBe(50);
    expect(limiteDaFerramenta('muitos')).toBe(50);
    expect(limiteDaFerramenta(1.5)).toBe(50);
  });
});

describe('formato JSON-RPC', () => {
  it('resposta carrega o id e o resultado', () => {
    expect(resposta(7, { ok: true })).toEqual({ jsonrpc: '2.0', id: 7, result: { ok: true } });
  });

  it('erro sem id vira id nulo, como a especificação pede', () => {
    expect(erro(undefined, CODIGO.parseError, 'x')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: CODIGO.parseError, message: 'x' },
    });
  });
});

// "structuredContent: Input should be a valid dictionary" foi o que um
// comprador recebeu ao pedir a lista de automações. A consulta funcionou; o
// cliente recusou a nossa resposta.
describe('paraEstruturado', () => {
  it('embrulha lista, que é o que quase toda ferramenta devolve', () => {
    expect(paraEstruturado([{ id: 1 }, { id: 2 }])).toEqual({ itens: [{ id: 1 }, { id: 2 }] });
    expect(paraEstruturado([])).toEqual({ itens: [] });
  });

  it('deixa objeto como está', () => {
    expect(paraEstruturado({ id: 7, nome: 'teste' })).toEqual({ id: 7, nome: 'teste' });
  });

  it('nunca devolve algo que não seja objeto', () => {
    for (const valor of [null, undefined, 3, 'texto', true]) {
      const saida = paraEstruturado(valor);
      expect(Array.isArray(saida)).toBe(false);
      expect(typeof saida).toBe('object');
      expect(saida).not.toBeNull();
    }
  });
});
