import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aplicativosEstranhos,
  aplicativosInscritos,
  camposInscritos,
  garantirInscricao,
  WEBHOOK_FIELDS,
} from '@/lib/meta/subscribe';

/*
 * A pergunta que faltava: os avisos desta conta vão para QUAL aplicativo?
 *
 * A resposta da Meta é uma lista de aplicativos, e o painel somava os campos de
 * todos sem olhar de quem eram. Com isso, "não falta aviso nenhum" era a mesma
 * resposta para a conta inscrita no aplicativo deste painel e para a conta
 * inscrita em outro aplicativo da pessoa. No segundo caso a Meta entrega no
 * endereço do outro, a tela de Eventos recebidos fica vazia para sempre, e as
 * duas metades do diagnóstico respondem certo, cada uma sobre um aplicativo
 * diferente. Custou quatorze dias de uma instalação em novembro de 2026.
 *
 * O que estas guardas prendem: o painel sabe acusar isso quando sabe, e fica
 * calado quando não sabe — porque acusar por falta de dado manda consertar o
 * que não está quebrado.
 */

const TODOS = WEBHOOK_FIELDS.split(',');
const NOSSO = '1122334455';

/** A Meta respondendo a lista de aplicativos inscritos nesta conta. */
function contaInscritaEm(apps: readonly { id?: string; name?: string; campos: readonly string[] }[]) {
  const buscar = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ success: true }, { status: 200 });
    return Response.json({
      data: apps.map((app) => ({
        ...(app.id === undefined ? {} : { id: app.id }),
        ...(app.name === undefined ? {} : { name: app.name }),
        subscribed_fields: app.campos,
      })),
    }, { status: 200 });
  });
  vi.stubGlobal('fetch', buscar);
  return { buscar };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('de quem são os avisos que esta conta assina', () => {
  it('nomeia o aplicativo quando a Meta manda a identificação', async () => {
    contaInscritaEm([{ id: '999', name: 'Radar antigo', campos: TODOS }]);

    const apps = await aplicativosInscritos('1784', 'IGAAtoken');

    expect(apps).toEqual([{ appId: '999', nome: 'Radar antigo', campos: TODOS }]);
  });

  /*
   * O formato antigo, sem identificação, é o que toda instalação que funciona
   * hoje recebe de volta. Ele não pode virar `appId` inventado nem lista vazia:
   * a soma dos campos continua sendo a resposta.
   */
  it('resposta sem identificação continua valendo pelos campos', async () => {
    contaInscritaEm([{ campos: TODOS }]);

    expect(await camposInscritos('1784', 'IGAAtoken')).toEqual(TODOS);
    expect((await aplicativosInscritos('1784', 'IGAAtoken'))[0].appId).toBeNull();
  });

  it('a soma dos campos não muda com a identificação na resposta', async () => {
    contaInscritaEm([
      { id: '999', campos: ['comments'] },
      { id: NOSSO, campos: ['messages'] },
    ]);

    expect(await camposInscritos('1784', 'IGAAtoken')).toEqual(['comments', 'messages']);
  });

  /*
   * Pedir a identificação não pode cegar o diagnóstico onde a Meta não aceita o
   * campo: a pergunta antiga é refeita, e o painel continua sabendo os campos.
   */
  it('a Meta recusando o campo novo: refaz a pergunta antiga', async () => {
    let perguntas = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      perguntas += 1;
      if (String(url).includes('id%2Cname%2Csubscribed_fields') || String(url).includes('id,name,subscribed_fields')) {
        return Response.json({ error: { message: 'unknown fields' } }, { status: 400 });
      }
      return Response.json({ data: [{ subscribed_fields: TODOS }] }, { status: 200 });
    }));

    expect(await camposInscritos('1784', 'IGAAtoken')).toEqual(TODOS);
    expect(perguntas).toBe(2);
  });

  it('a conferência carrega os aplicativos junto', async () => {
    contaInscritaEm([{ id: NOSSO, name: 'Radar Dela', campos: TODOS }]);

    const r = await garantirInscricao('1784', 'IGAAtoken');

    expect(r.estado).toBe('em-ordem');
    expect(r.aplicativos).toEqual([{ appId: NOSSO, nome: 'Radar Dela', campos: TODOS }]);
  });
});

describe('o aplicativo estranho', () => {
  it('silêncio quando o aplicativo deste painel está na lista', () => {
    const inscritos = [
      { appId: NOSSO, nome: 'Radar Dela', campos: TODOS },
      { appId: '999', nome: 'Outro', campos: TODOS },
    ];

    expect(aplicativosEstranhos(inscritos, NOSSO)).toEqual([]);
  });

  it('acusa quando quem recebe é só outro aplicativo', () => {
    const inscritos = [{ appId: '999', nome: 'Radar antigo', campos: TODOS }];

    expect(aplicativosEstranhos(inscritos, NOSSO)).toEqual(inscritos);
  });

  /*
   * As duas formas de não saber. Acusar aqui manda a pessoa religar uma conta
   * que já está no aplicativo certo, e isso é pior do que não dizer nada.
   */
  it('silêncio sem a identificação do nosso aplicativo no ambiente', () => {
    expect(aplicativosEstranhos([{ appId: '999', nome: null, campos: TODOS }], '')).toEqual([]);
    expect(aplicativosEstranhos([{ appId: '999', nome: null, campos: TODOS }], '   ')).toEqual([]);
  });

  it('silêncio quando a Meta não disse de quem são os avisos', () => {
    expect(aplicativosEstranhos([{ appId: null, nome: null, campos: TODOS }], NOSSO)).toEqual([]);
  });

  it('silêncio quando a conta não assina nada: isso a tela já diz por falta', () => {
    expect(aplicativosEstranhos([], NOSSO)).toEqual([]);
  });
});
