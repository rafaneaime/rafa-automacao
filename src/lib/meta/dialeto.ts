import { GRAPH_BASE, GRAPH_UNIFICADO, GRAPH_VERSION, metaGet } from './client';
import { getProfile } from './profile';

/**
 * Por qual porta da Meta esta conta fala.
 *
 * - `instagram`: API do Instagram com login do Instagram. Token do usuário do
 *   Instagram, que vale 60 dias e precisa ser renovado. É o que toda
 *   instalação feita até outubro de 2026 usa.
 * - `unificado`: API do Instagram com login unificado, lançada em setembro de
 *   2026 e a única oferecida em app novo. Token de usuário do sistema de
 *   integração comercial, que **não expira**, e chamadas em
 *   `graph.facebook.com` usando o id da conta profissional.
 *
 * Guardar isso por conta, e não por instalação, é de propósito: o mesmo painel
 * pode ter uma conta antiga conectada e outra nova.
 */
export type Dialeto = 'instagram' | 'unificado';

export function hostDoDialeto(dialeto: Dialeto): string {
  return dialeto === 'unificado' ? GRAPH_UNIFICADO : GRAPH_BASE;
}

/** O que vier do banco torto vale como o dialeto antigo, que é o que existia. */
export function lerDialeto(valor: unknown): Dialeto {
  return valor === 'unificado' ? 'unificado' : 'instagram';
}

/**
 * O endereço provável, lido do formato do token.
 *
 * Só para chamada que pode falhar sem custo — ler o `@` de quem mandou DM,
 * perguntar se a pessoa segue a conta. Nessas o parâmetro não é a conta, e sim
 * a pessoa do outro lado, então não há de onde buscar o dialeto gravado.
 *
 * O padrão é o endereço antigo: só o prefixo `EAA`, que é o do token de
 * usuário do sistema, muda de porta. Assim nenhuma instalação que já funciona
 * passa a depender de um palpite. **Envio não usa isto** — envio lê o dialeto
 * gravado na conta, porque errar lá é mensagem que não sai.
 */
export function hostProvavelDoToken(token: string): string {
  return token.startsWith('EAA') ? GRAPH_UNIFICADO : GRAPH_BASE;
}

/**
 * As contas que o cliente compartilhou com o app no login unificado.
 *
 * Com token de usuário do sistema, `/me` é o usuário do sistema — não a conta
 * do Instagram. Quem tem as contas é `/me/assigned_instagram_accounts`, e um
 * mesmo token pode cobrir mais de uma.
 */
export async function contasCompartilhadas(
  token: string,
): Promise<{ igUserId: string; username: string | null }[]> {
  const bruto = await metaGet(
    `/${GRAPH_VERSION}/me/assigned_instagram_accounts`,
    { fields: 'id,username', access_token: token },
    GRAPH_UNIFICADO,
  );
  const dados = (bruto as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return [];
  return dados.flatMap((item) => {
    const conta = item as { id?: unknown; username?: unknown };
    const id = typeof conta.id === 'string' ? conta.id : null;
    return id
      ? [{ igUserId: id, username: typeof conta.username === 'string' ? conta.username : null }]
      : [];
  });
}

/** Confere que o token manda nesta conta, e de quebra traz o `@` dela. */
export async function conferirConta(
  igUserId: string,
  token: string,
): Promise<{ igUserId: string; username: string | null }> {
  const bruto = await metaGet(
    `/${GRAPH_VERSION}/${igUserId.trim()}`,
    { fields: 'id,username', access_token: token },
    GRAPH_UNIFICADO,
  );
  const dados = bruto as { id?: unknown; username?: unknown };
  if (typeof dados.id !== 'string') {
    throw new Error(`A Meta não devolveu a conta ${igUserId.trim()} para este token.`);
  }
  return {
    igUserId: dados.id,
    username: typeof dados.username === 'string' ? dados.username : null,
  };
}

export type ContaIdentificada = {
  dialeto: Dialeto;
  igUserId: string;
  username: string | null;
};

/**
 * De que lado este token fala, e de quem é a conta.
 *
 * Decidido pelo comportamento, não pelo formato do texto: o painel tenta os
 * dois e fica com o que respondeu. O prefixo do token só escolhe a ordem —
 * token de login do Instagram começa com `IGAA`, o do sistema com `EAA` —, e
 * errar a ordem custa uma chamada, não o resultado.
 *
 * Perguntar antes de decidir é o que permite o mesmo campo de colar token
 * continuar servindo aos dois caminhos: o aluno não precisa saber em qual
 * deles o aplicativo dele caiu.
 */
export async function identificarConta(
  token: string,
  igUserIdInformado?: string | null,
): Promise<ContaIdentificada> {
  const ordem: Dialeto[] = token.startsWith('IGAA') ? ['instagram', 'unificado'] : ['unificado', 'instagram'];
  const erros: string[] = [];

  for (const dialeto of ordem) {
    try {
      if (dialeto === 'instagram') {
        const perfil = await getProfile(token);
        return { dialeto, igUserId: perfil.igUserId, username: perfil.username };
      }
      /*
       * O id informado vem antes da descoberta de propósito.
       *
       * `assigned_instagram_accounts` só lista o que foi compartilhado pelo
       * fluxo de login de produção. O token que a tela da Meta gera na tabela
       * de testes — que é por onde todo aluno passa, com a conta como
       * testadora — funciona na conta e **não aparece nessa lista**.
       * Conferido em 29/10/2026 contra um aplicativo real: a lista veio vazia
       * e, no mesmo segundo, a conta respondeu nome e usuário ao mesmo token.
       *
       * Então, quando a pessoa informa o id — que a Meta escreve embaixo do
       * nome da conta, na mesma linha do botão de gerar token —, o painel
       * confere esse id em vez de procurar numa lista que não vai ter nada.
       */
      if (igUserIdInformado) {
        return { dialeto, ...(await conferirConta(igUserIdInformado, token)) };
      }
      const contas = await contasCompartilhadas(token);
      // Mais de uma conta compartilhada: a primeira é um palpite, e palpite
      // aqui conecta o painel na conta errada. Quem escolhe é a tela.
      if (contas.length === 1) return { dialeto, ...contas[0] };
      if (contas.length > 1) {
        throw new Error(
          `Este token dá acesso a ${contas.length} contas do Instagram: ` +
            `${contas.map((c) => c.username ?? c.igUserId).join(', ')}. ` +
            'Gere um token que compartilhe só a conta que este painel vai usar.',
        );
      }
      /*
       * A Meta responde 200 com lista vazia, e não erro: o token é válido, só
       * não tem conta atribuída. Acontece quando o token é gerado antes de a
       * conta entrar como testadora, ou com o convite ainda por aceitar — e o
       * aluno não tem como adivinhar isso de "não consegui conectar".
       * Conferido em 29/10/2026 contra um aplicativo recém-criado.
       */
      throw new Error(
        'Este token é válido, mas a Meta não disse a que conta ele pertence. ' +
          'Isso é normal no token gerado pela tela do aplicativo: copie também o ' +
          'número que aparece embaixo do nome da conta, em "Gerar tokens de acesso", ' +
          'e cole no campo do id da conta aqui ao lado.',
      );
    } catch (erro) {
      erros.push(`${dialeto}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  throw new Error(
    'Não consegui identificar a conta por nenhum dos dois caminhos da Meta. ' +
      erros.join(' | '),
  );
}
