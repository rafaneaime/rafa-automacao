export type MatchMode = 'contains' | 'exact' | 'any';

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    // U+0300 a U+036F é o bloco de acentos combinantes que o NFD separa.
    // Escrito com escapes de propósito: os caracteres literais são invisíveis
    // e sobrevivem mal a cópia entre arquivos.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesKeyword(
  text: string,
  keywords: string[],
  mode: MatchMode,
): boolean {
  if (mode === 'any') return true;

  const haystack = normalize(text);

  return keywords.some((keyword) => {
    const needle = normalize(keyword);
    if (needle.length === 0) return false;
    return mode === 'exact' ? haystack === needle : haystack.includes(needle);
  });
}
