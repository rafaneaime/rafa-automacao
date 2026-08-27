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
