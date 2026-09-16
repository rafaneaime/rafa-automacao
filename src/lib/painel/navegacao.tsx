/**
 * Itens do menu do painel — versão do PRODUTO BASE.
 *
 * Exportada como `navegacao.ts` na base. Só as telas que existem lá: sem
 * Audiência e sem Leads, que são da Plataforma.
 */
import type { ReactNode } from 'react';
import { IconeChave, IconeGlobo, IconeMegafone, IconePessoas } from './icones';

export type LinkDoPainel = {
  href: string;
  label: string;
  icone: ReactNode;
};

export const LINKS_DO_PAINEL: readonly LinkDoPainel[] = [
  { href: '/', label: 'Automações', icone: <IconeMegafone /> },
  { href: '/contatos', label: 'Contatos', icone: <IconePessoas /> },
  { href: '/logs', label: 'Logs', icone: <IconeGlobo /> },
  { href: '/configuracao', label: 'Configuração', icone: <IconeChave /> },
];

export type ConviteDeUpgrade = { href: string; label: string };

/**
 * O caminho da versão simples para a Plataforma.
 *
 * Só existe aqui. A Plataforma já é o destino, e o disparador é o produto
 * gratuito do Fluxo, que sai sem oferta por decisão.
 *
 * Os `utm_` dizem, na página de vendas, que a visita veio de dentro do painel
 * de quem já instalou — o público mais quente que existe para essa oferta.
 */
export const CONVITE_DE_UPGRADE: ConviteDeUpgrade | null = {
  href: 'https://adeusmensalidade.com.br/radar-de-compradores?utm_source=meuchat&utm_medium=painel&utm_campaign=upgrade',
  label: 'Upgrade',
};
