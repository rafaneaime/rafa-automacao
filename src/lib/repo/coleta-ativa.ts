import { sql } from '../db';

/**
 * Esta instalação coleta eventos em algum site próprio?
 *
 * Existe por causa de uma frase da política de privacidade que estava certa e
 * passou a estar errada. Ela diz que "não há rastreamento em outras partes do
 * Instagram, **em outros sites**, nem coleta por formulários externos" — o que
 * é verdade no produto base, que não tem módulo de coleta nenhum, e vira
 * mentira na instalação que cadastra um site e cola o `coleta.js`.
 *
 * Uma política que descreve errado o que o software faz é pior do que uma
 * política ruim: ela é a peça que o Meta lê para aprovar o app, e é o que a
 * pessoa do outro lado usa para decidir se confia.
 *
 * A página é **uma só**, do produto base, e vai para todo aluno. Por isso a
 * checagem é em tempo de execução e não em tempo de build: `tracked_sites` só
 * existe onde a Plataforma foi instalada, e mesmo lá só importa se alguém
 * chegou a cadastrar um site. Instalação sem site nenhum continua mostrando o
 * texto original, que para ela continua verdadeiro.
 *
 * É o mesmo recurso que `repo/diagnostico.ts` usa para a tela de Logs da base
 * enxergar `events` quando ela existe: `to_regclass` devolve `null` quando a
 * tabela não existe, em vez de a consulta explodir.
 */
export async function coletaEmSiteAtiva(): Promise<boolean> {
  try {
    const existe = (await sql`
      select to_regclass('public.tracked_sites') is not null as existe
    `) as { existe: boolean }[];
    if (!existe[0]?.existe) return false;

    const rows = (await sql`
      select exists (
        select 1 from tracked_sites where revogado_em is null
      ) as tem
    `) as { tem: boolean }[];
    return rows[0]?.tem ?? false;
  } catch {
    // Banco fora do ar não pode derrubar a política de privacidade: ela é
    // pública, e o Meta pode estar lendo. Na dúvida, o texto original.
    return false;
  }
}
