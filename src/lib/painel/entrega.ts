export const STATUS_DE_ENTREGA = [
  'pending',
  'sent',
  'error',
  'throttled',
] as const;

export type StatusDeEntrega = (typeof STATUS_DE_ENTREGA)[number];

export const TEXTOS_DOS_STATUS: Record<StatusDeEntrega, string> = {
  pending: 'Reservada mas não concluída',
  sent: 'Enviada',
  error: 'Não enviada',
  throttled: 'Segurada pelo limite de envios da conta',
};

function statusConhecido(status: string): status is StatusDeEntrega {
  return (STATUS_DE_ENTREGA as readonly string[]).includes(status);
}

export function desfechoDaEntrega(
  status: string,
  erro: string | null,
): { rotulo: string; detalhe: string | null } {
  return {
    rotulo: statusConhecido(status) ? TEXTOS_DOS_STATUS[status] : status,
    // A mensagem do Meta é evidência, não enfeite. Cortá-la pode remover
    // justamente o código ou a permissão que explica a falha.
    detalhe: status === 'error' ? erro : null,
  };
}

export function normalizarBuscaPessoa(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().replace(/^@+/, '').toLowerCase();
}

export function diagnosticoSemEntrega(
  temInteracao: boolean,
  temEntrega: boolean,
): string | null {
  return temInteracao && !temEntrega
    ? 'O sistema recebeu o comentário e não enviou DM. O motivo não ficou registrado.'
    : null;
}
