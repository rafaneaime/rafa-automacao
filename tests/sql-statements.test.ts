import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitSqlStatements, analisarSql, motivoDestrutivo } from '@/lib/sql-statements';

describe('splitSqlStatements', () => {
  it('separa comandos simples', () => {
    expect(splitSqlStatements('select 1; select 2;')).toEqual(['select 1', 'select 2']);
  });

  it('não exige ponto e vírgula no último comando', () => {
    expect(splitSqlStatements('select 1;\nselect 2')).toEqual(['select 1', 'select 2']);
  });

  it('devolve lista vazia para entrada vazia ou só espaço', () => {
    expect(splitSqlStatements('')).toEqual([]);
    expect(splitSqlStatements('   \n\t  ')).toEqual([]);
  });

  it('ignora pontos e vírgulas soltos', () => {
    expect(splitSqlStatements(';;;')).toEqual([]);
  });

  // A partir daqui está o motivo de esta função existir: o split(';') ingênuo
  // quebra em todos os casos abaixo, e cada um deles é um comando cortado ao
  // meio chegando no banco de um aluno durante o build.

  it('não corta em ponto e vírgula dentro de string', () => {
    const sql = "insert into t (msg) values ('oi; tudo bem?'); select 1";
    expect(splitSqlStatements(sql)).toEqual([
      "insert into t (msg) values ('oi; tudo bem?')",
      'select 1',
    ]);
  });

  it('entende aspas simples escapadas dentro de string', () => {
    const sql = "select 'não é o que; parece''ok'; select 2";
    expect(splitSqlStatements(sql)).toEqual([
      "select 'não é o que; parece''ok'",
      'select 2',
    ]);
  });

  it('não corta em ponto e vírgula dentro de comentário de linha', () => {
    const sql = 'select 1 -- comentário; com ponto e vírgula\n; select 2';
    expect(splitSqlStatements(sql)).toEqual([
      'select 1 -- comentário; com ponto e vírgula',
      'select 2',
    ]);
  });

  it('não corta em ponto e vírgula dentro de comentário de bloco', () => {
    const sql = 'select /* nota; aqui */ 1; select 2';
    expect(splitSqlStatements(sql)).toEqual(['select /* nota; aqui */ 1', 'select 2']);
  });

  it('entende comentário de bloco aninhado, como o Postgres', () => {
    const sql = 'select /* fora /* dentro; */ ainda fora; */ 1; select 2';
    expect(splitSqlStatements(sql)).toEqual([
      'select /* fora /* dentro; */ ainda fora; */ 1',
      'select 2',
    ]);
  });

  it('não corta dentro de dollar quoting sem tag', () => {
    const sql = 'select $$corpo; com ponto e vírgula$$; select 2';
    expect(splitSqlStatements(sql)).toEqual([
      'select $$corpo; com ponto e vírgula$$',
      'select 2',
    ]);
  });

  it('não corta dentro de dollar quoting com tag', () => {
    const sql = 'create function f() returns int as $fn$ begin; return 1; end; $fn$ language plpgsql; select 2';
    expect(splitSqlStatements(sql)).toEqual([
      'create function f() returns int as $fn$ begin; return 1; end; $fn$ language plpgsql',
      'select 2',
    ]);
  });

  it('não confunde placeholder $1 com dollar quoting', () => {
    const sql = 'select * from t where id = $1; select 2';
    expect(splitSqlStatements(sql)).toEqual([
      'select * from t where id = $1',
      'select 2',
    ]);
  });

  it('não corta dentro de identificador com aspas duplas', () => {
    const sql = 'select "coluna; estranha" from t; select 2';
    expect(splitSqlStatements(sql)).toEqual([
      'select "coluna; estranha" from t',
      'select 2',
    ]);
  });

  it('descarta trecho que só tem comentário', () => {
    const sql = 'select 1;\n-- só um comentário no fim do arquivo\n';
    expect(splitSqlStatements(sql)).toEqual(['select 1']);
  });

  it('mantém o comentário que faz parte do comando', () => {
    const sql = '-- por que esta coluna existe\nalter table t add column c int';
    expect(splitSqlStatements(sql)).toEqual([
      '-- por que esta coluna existe\nalter table t add column c int',
    ]);
  });

  it('reclama de string não fechada em vez de mandar comando quebrado', () => {
    expect(() => splitSqlStatements("select 'sem fim")).toThrow(/não fechada/);
    expect(() => splitSqlStatements('select $$sem fim')).toThrow(/não fechada/);
  });

  // Âncora de regressão: o schema real precisa continuar produzindo os mesmos
  // comandos que o `split(';')` produzia.
  //
  // Sem número fixo de propósito. A primeira versão afirmava "9 comandos", e
  // ela quebrou no dia em que o schema ganhou uma tabela — acusando uma
  // mudança legítima como se fosse defeito. O que importa aqui não é quantos
  // comandos existem, é os dois separadores concordarem: no dia em que
  // deixarem de concordar, é porque o schema ganhou aspas, comentário ou
  // corpo de função que o ingênuo cortaria no meio.
  // O split ingênuo serve de referência independente, e só funciona enquanto o
  // schema não tiver `;` dentro de comentário ou string. Se este teste falhar
  // depois de você editar `db/schema.sql`, confira primeiro se foi isso: o
  // parser está certo, e o comentário é que precisa perder o ponto e vírgula.
  it('separa o schema atual igual ao split ingênuo', () => {
    const schema = readFileSync('db/schema.sql', 'utf8');
    const antes = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const depois = splitSqlStatements(schema);

    expect(depois).toEqual(antes);
    expect(depois.length).toBeGreaterThan(0);
  });
});

describe('analisarSql', () => {
  it('devolve o comando cru e a versão sem comentário nem conteúdo de string', () => {
    const [comando] = analisarSql(
      "-- explica\nselect 'texto com drop table dentro' from t",
    );
    expect(comando.raw).toContain('-- explica');
    expect(comando.codigo).not.toContain('explica');
    expect(comando.codigo).not.toContain('drop table');
    expect(comando.codigo).toContain('select');
    expect(comando.codigo).toContain('from t');
  });
});

describe('motivoDestrutivo', () => {
  // A regra de migração aditiva só vale alguma coisa se algo a impedir de ser
  // quebrada. Quem quebra não é o autor distraído — é o deploy do aluno, que
  // roda a migração sem ninguém olhando e sem backup.
  const proibidos = [
    ['drop table contacts', /apaga uma tabela/i],
    ['DROP TABLE IF EXISTS contacts', /apaga uma tabela/i],
    ['alter table contacts drop column username', /apaga uma coluna/i],
    ['truncate contacts', /esvazia uma tabela/i],
    ['drop schema public cascade', /apaga um schema/i],
    ['alter table contacts alter column id type bigint', /troca o tipo/i],
  ] as const;

  for (const [comando, esperado] of proibidos) {
    it(`recusa: ${comando}`, () => {
      expect(motivoDestrutivo(comando)).toMatch(esperado);
    });
  }

  const permitidos = [
    'create table if not exists eventos (id serial primary key)',
    'alter table contacts add column if not exists email text',
    'create index if not exists eventos_idx on eventos (id)',
    'update contacts set username = null where id = 1',
    'drop index if exists indice_antigo',
  ];

  for (const comando of permitidos) {
    it(`permite: ${comando.slice(0, 45)}`, () => {
      expect(motivoDestrutivo(comando)).toBeNull();
    });
  }

  it('não se assusta com a palavra proibida dentro de comentário', () => {
    const [comando] = analisarSql(
      '-- nunca use drop table aqui\nalter table t add column if not exists c int',
    );
    expect(motivoDestrutivo(comando.codigo)).toBeNull();
  });

  it('não se assusta com a palavra proibida dentro de string', () => {
    const [comando] = analisarSql(
      "insert into logs (msg) values ('tentaram drop table ontem')",
    );
    expect(motivoDestrutivo(comando.codigo)).toBeNull();
  });
});
