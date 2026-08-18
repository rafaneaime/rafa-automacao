export type PassoParaValidar = {
  kind: 'public_reply' | 'dm';
  variants: string[];
};

export class AutomacaoInvalidaError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'AutomacaoInvalidaError';
  }
}

const SEM_DM = 'A automação não tem texto de DM. Sem isso ela não envia nada.';

// Regra única de publicação. Vive aqui, e não no formulário, porque o painel
// não é o único caminho que grava automações — o criador por linguagem natural
// do produto pago usa as mesmas funções de repositório.
export function validarPublicacao(
  _triggerType: 'comment' | 'dm',
  steps: PassoParaValidar[],
): string | null {
  const dm = steps.find((s) => s.kind === 'dm');
  const temTexto = dm?.variants.some((v) => v.trim().length > 0) ?? false;
  return temTexto ? null : SEM_DM;
}
