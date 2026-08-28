import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O guarda do princípio da seção 15 do ARCHITECTURE:
 *
 * > Cada instalação é responsável pela própria infraestrutura, credenciais,
 * > consumo e cobrança de serviços externos.
 *
 * Um princípio que vive só na documentação vira intenção. Este teste é o que
 * transforma ele em regra: se um dia alguém — eu, o Codex, ou o Rafa com
 * pressa — colar um token nosso como valor padrão "só para testar", a suíte
 * para.
 *
 * O risco é real e específico deste produto: cada cópia instalada roda com as
 * credenciais de quem instalou. Uma credencial nossa vazando para dentro do
 * código não é um bug de configuração — é a conta do Meta de todo mundo
 * passando a ser a nossa, com o consumo e o bloqueio junto.
 */

function arquivosDeCodigo(raiz: string): string[] {
  const achados: string[] = [];

  function andar(dir: string) {
    for (const nome of readdirSync(dir)) {
      if (nome === 'node_modules' || nome === '.next') continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
      } else if (/\.(ts|tsx|js|mjs)$/.test(nome)) {
        achados.push(caminho);
      }
    }
  }

  andar(raiz);
  return achados;
}

const CODIGO = [
  ...arquivosDeCodigo('src'),
  ...arquivosDeCodigo('scripts'),
  ...arquivosDeCodigo('public'),
];

describe('nenhuma credencial nossa dentro do código', () => {
  it('não existe segredo com cara de credencial escrito à mão', () => {
    // Formatos reais dos serviços que este produto toca. Não é uma varredura
    // genérica de "coisa parecida com senha": é a lista do que faria estrago
    // se aparecesse aqui.
    const formatos: [string, RegExp][] = [
      ['token de acesso do Meta', /\bEAA[A-Za-z0-9]{20,}/],
      ['chave da OpenAI', /\bsk-[A-Za-z0-9_-]{20,}/],
      ['chave da Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
      ['string de conexão do Postgres', /postgres(?:ql)?:\/\/[^\s'"]*:[^\s'"@]+@/],
      ['token da Vercel/Neon', /\b(?:vercel|neon)_[A-Za-z0-9]{20,}/i],
    ];

    const achados: string[] = [];
    for (const caminho of CODIGO) {
      const conteudo = readFileSync(caminho, 'utf8');
      for (const [nome, formato] of formatos) {
        if (formato.test(conteudo)) achados.push(`${caminho}: ${nome}`);
      }
    }

    expect(achados).toEqual([]);
  });

  it('nenhuma credencial tem valor padrão embutido', () => {
    // `process.env.X ?? 'algo'` e `process.env.X || 'algo'` são o jeito mais
    // silencioso de uma credencial nossa virar o padrão de todo mundo: a
    // instalação que esquecer de configurar passa a usar a nossa sem que
    // ninguém perceba, e vai funcionar — que é o pior desfecho possível.
    const CREDENCIAIS =
      'ACCESS_TOKEN|IG_APP_ID|IG_APP_SECRET|IG_USER_ID|VERIFY_TOKEN|' +
      'DATABASE_URL|PANEL_PASSWORD|HOTMART_HOTTOK|CRON_SECRET';
    const comPadrao = new RegExp(
      `process\\.env\\.(?:${CREDENCIAIS})\\s*(?:\\?\\?|\\|\\|)\\s*['"\`][^'"\`]`,
    );

    const achados = CODIGO.filter((caminho) =>
      comPadrao.test(readFileSync(caminho, 'utf8')),
    );

    expect(achados).toEqual([]);
  });

  it('o exemplo de ambiente não vem preenchido', () => {
    // `.env.example` é copiado por quem instala. Uma linha preenchida ali é
    // uma credencial distribuída para todo mundo.
    const exemplo = readFileSync('.env.example', 'utf8');

    const preenchidas = exemplo
      .split(/\r?\n/)
      .filter((linha) => /^[A-Z_]+=.+/.test(linha.trim()))
      // Comentário e linha vazia não contam; valor entre <> é marcador.
      .filter((linha) => !/=\s*<.*>\s*$/.test(linha.trim()));

    expect(preenchidas).toEqual([]);
  });
});
