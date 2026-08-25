import { describe, expect, it } from 'vitest';
import { mesclarPassos } from '@/lib/automations/passos';
import type { AutomationStep } from '@/lib/repo/types';

type PassoParaSalvar = Pick<
  AutomationStep,
  'position' | 'kind' | 'variants' | 'buttons'
>;

function passo(
  position: number,
  kind: AutomationStep['kind'],
  texto: string,
  buttons: AutomationStep['buttons'] = [],
): PassoParaSalvar {
  return { position, kind, variants: [texto], buttons };
}

const passosDoFormulario = () => [
  passo(0, 'public_reply', 'público novo'),
  passo(1, 'dm', 'dm nova'),
  passo(2, 'follow_up', 'continuação nova 1'),
  passo(3, 'follow_up', 'continuação nova 2'),
];

describe('mesclarPassos', () => {
  it('mantém exatamente os quatro passos do formulário quando não há posição extra', () => {
    const formulario = passosDoFormulario();
    const existentes = [
      passo(0, 'public_reply', 'público antigo'),
      passo(1, 'dm', 'dm antiga'),
      passo(2, 'follow_up', 'continuação antiga 1'),
      passo(3, 'follow_up', 'continuação antiga 2'),
    ];

    expect(mesclarPassos(existentes, formulario)).toEqual(formulario);
  });

  it('preserva variants e buttons de um passo cuja posição não veio do formulário', () => {
    const botao = { title: 'Oferta', url: 'https://example.com/oferta' };
    const extra = passo(4, 'follow_up', 'continuação extra', [botao]);

    const resultado = mesclarPassos([...passosDoFormulario(), extra], passosDoFormulario());

    expect(resultado).toHaveLength(5);
    expect(resultado[4]).toEqual(extra);
    expect(resultado[4].variants).toEqual(['continuação extra']);
    expect(resultado[4].buttons).toEqual([botao]);
  });

  it('faz o passo do formulário vencer quando a posição já existe', () => {
    const formulario = passosDoFormulario();
    const antigo = passo(2, 'follow_up', 'texto que deve desaparecer');

    const resultado = mesclarPassos([antigo], formulario);

    expect(resultado.find(({ position }) => position === 2)).toBe(formulario[2]);
    expect(resultado).not.toContain(antigo);
  });

  it('ordena os passos do formulário quando os existentes estão vazios', () => {
    const formulario = [
      passo(3, 'follow_up', 'três'),
      passo(1, 'dm', 'um'),
      passo(0, 'public_reply', 'zero'),
      passo(2, 'follow_up', 'dois'),
    ];

    expect(mesclarPassos([], formulario).map(({ position }) => position)).toEqual([0, 1, 2, 3]);
  });

  it('aceita a lista vazia usada quando getAutomation devolve null', () => {
    const automacaoInexistente = (): { steps: PassoParaSalvar[] } | null => null;
    const atual = automacaoInexistente();

    expect(mesclarPassos(atual?.steps ?? [], passosDoFormulario())).toHaveLength(4);
  });

  it('não altera arrays, objetos, variants nem buttons recebidos', () => {
    const existentes = [
      passo(5, 'follow_up', 'extra', [{ title: 'Abrir', url: 'https://example.com' }]),
    ];
    const formulario = [passo(1, 'dm', 'mensagem')];
    const existentesAntes = structuredClone(existentes);
    const formularioAntes = structuredClone(formulario);
    const objetoExistente = existentes[0];
    const objetoFormulario = formulario[0];

    mesclarPassos(existentes, formulario);

    expect(existentes).toEqual(existentesAntes);
    expect(formulario).toEqual(formularioAntes);
    expect(existentes[0]).toBe(objetoExistente);
    expect(formulario[0]).toBe(objetoFormulario);
  });
});
