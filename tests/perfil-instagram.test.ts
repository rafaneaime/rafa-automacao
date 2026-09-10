import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O `@` da pessoa vem da API do Meta e vira `href`. Este teste é sobre isso.
 *
 * Um nome com `/`, `:` ou `?` montaria uma URL para outro lugar, e o link do
 * painel levaria quem clicou para onde alguém de fora escolheu. Não é hipótese
 * elegante: o valor atravessa um sistema que não é nosso antes de chegar aqui.
 *
 * O componente é JSX e este projeto não tem renderizador de React nos testes,
 * então o guarda é sobre a regra que decide — a expressão que separa nome que
 * vira link de nome que vira texto. É ela que carrega a segurança.
 */
const FONTE = readFileSync('src/lib/painel/ui.tsx', 'utf8');

function padraoDoUsuario(): RegExp {
  const achado = FONTE.match(/const USUARIO_DO_INSTAGRAM = (\/.+\/);/);
  if (!achado) throw new Error('USUARIO_DO_INSTAGRAM sumiu de ui.tsx');
  const [, corpo] = achado;
  const ultimaBarra = corpo.lastIndexOf('/');
  return new RegExp(corpo.slice(1, ultimaBarra), corpo.slice(ultimaBarra + 1));
}

describe('quem vira link de perfil', () => {
  const padrao = padraoDoUsuario();

  it.each([
    'rneaime',
    'davidfreey',
    'box100selfstorage',
    'evandroleao.digital',
    'igor.braga_',
    'a',
    'A_B.c9',
  ])('aceita %j, que é @ de verdade', (nome) => {
    expect(padrao.test(nome)).toBe(true);
  });

  it.each([
    ['barra abre outro caminho', 'fulano/../../evil.com'],
    ['duas barras trocam o host', '//evil.com'],
    ['dois pontos trocam o esquema', 'javascript:alert(1)'],
    ['interrogação vira query', 'fulano?x=1'],
    ['arroba pode virar userinfo', 'fulano@evil.com'],
    ['espaço', 'fulano da silva'],
    ['vazio', ''],
    ['acima de 30 caracteres', 'a'.repeat(31)],
    ['quebra de linha', 'fulano\nevil'],
    ['porcento abre escape', 'fulano%2F..'],
    ['cerquilha corta o destino', 'fulano#x'],
  ])('recusa %s', (_caso, nome) => {
    expect(padrao.test(nome)).toBe(false);
  });

  it('o link é montado com o nome já conferido, e nada mais', () => {
    // Se alguém trocar por interpolação de outra variável, ou tirar a
    // conferência, isto quebra.
    expect(FONTE).toContain('href={`https://www.instagram.com/${username}/`}');
    expect(FONTE).toContain('!USUARIO_DO_INSTAGRAM.test(username)');
  });

  it('abre em outra aba sem entregar a nossa', () => {
    // Sem `noopener`, a página aberta consegue mexer na janela de origem.
    const trecho = FONTE.match(/rel="[^"]*"/)?.[0] ?? '';
    expect(trecho).toContain('noopener');
    expect(trecho).toContain('noreferrer');
  });
});
