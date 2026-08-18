// Precedência: o que a pessoa colou no painel ganha da variável de ambiente.
// A variável continua servindo como semente de quem acertou no deploy.
export function escolherToken(
  doCorpo: string | undefined,
  doAmbiente: string,
): string | null {
  const colado = (doCorpo ?? '').trim();
  if (colado.length > 0) return colado;
  const doEnv = doAmbiente.trim();
  return doEnv.length > 0 ? doEnv : null;
}
