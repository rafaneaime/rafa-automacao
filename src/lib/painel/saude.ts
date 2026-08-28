export type IdDaIntegracao =
  | 'instagram'
  | 'banco'
  | 'senha_painel'
  | 'assinatura_meta'
  | 'endereco_app'
  | 'hotmart'
  | 'segredo_cron';

export type Integracao = {
  id: IdDaIntegracao;
  nome: string;
  seFaltar: string;
  opcional: boolean;
};

export type EstadoDaIntegracao = 'configurado' | 'faltando' | 'opcional';

export const INTEGRACOES: readonly Integracao[] = [
  {
    id: 'instagram',
    nome: 'Instagram',
    seFaltar: 'Nada entra na instalação: comentários, mensagens e contatos não chegam.',
    opcional: false,
  },
  {
    id: 'banco',
    nome: 'Banco de dados',
    seFaltar: 'Toda a instalação para porque nenhum dado pode ser lido ou gravado.',
    opcional: false,
  },
  {
    id: 'senha_painel',
    nome: 'Senha do painel',
    seFaltar: 'O painel fica aberto sem proteção para qualquer pessoa que conheça o endereço.',
    opcional: false,
  },
  {
    id: 'assinatura_meta',
    nome: 'Assinatura do Meta',
    seFaltar: 'O webhook aceita notificações sem confirmar que vieram do Meta.',
    opcional: false,
  },
  {
    id: 'endereco_app',
    nome: 'Endereço do app',
    seFaltar: 'Os links rastreados enviados nas DMs podem apontar para o endereço errado.',
    opcional: false,
  },
  {
    id: 'hotmart',
    nome: 'Hotmart',
    seFaltar: 'Nenhuma venda da Hotmart é atribuída; configure se você vende por lá.',
    opcional: true,
  },
  {
    id: 'segredo_cron',
    nome: 'Segredo do cron',
    seFaltar: 'As rotas automáticas ficam abertas; configure se quiser exigir autenticação.',
    opcional: true,
  },
] as const;

export function estadoDaIntegracao(
  integracao: Integracao,
  presente: boolean,
): EstadoDaIntegracao {
  if (presente) return 'configurado';
  return integracao.opcional ? 'opcional' : 'faltando';
}

export function credencialPresente(valor: unknown): boolean {
  return typeof valor === 'string' && valor.trim().length > 0;
}
