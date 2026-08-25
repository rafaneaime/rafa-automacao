import type { AutomationStep } from '../repo/types';

type PassoParaSalvar = Pick<
  AutomationStep,
  'position' | 'kind' | 'variants' | 'buttons'
>;

export function mesclarPassos(
  existentes: PassoParaSalvar[],
  doFormulario: PassoParaSalvar[],
): PassoParaSalvar[] {
  const posicoesDoFormulario = new Set(doFormulario.map(({ position }) => position));
  const preservados = existentes.filter(
    ({ position }) => !posicoesDoFormulario.has(position),
  );

  return [...doFormulario, ...preservados].sort((a, b) => a.position - b.position);
}
