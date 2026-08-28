-- Uma entrega por pessoa, por automacao, por OCASIAO — e nao para sempre.
--
-- A trava original era `unique (automation_id, ig_user_id)`. Ela impedia duas
-- DMs pelo mesmo comentario, que e o que precisava mesmo; mas impedia tambem
-- a segunda DM pela segunda vez que a pessoa comentou, semanas depois, em
-- outro post. Quem ja tinha recebido uma automacao uma vez nunca mais recebia,
-- e nada em lugar nenhum dizia isso.
--
-- Provado em producao: dududrumond e eusoualinecamacho comentaram em 27/08 e
-- nao receberam nada, porque tinham recebido em 18/08.
--
-- `janela` guarda a ocasiao: `post:<media_id>` quando sabemos de qual post o
-- comentario veio, `dia:<YYYY-MM-DD>` quando nao. Ver
-- src/lib/automations/janela.ts.
--
-- `not null default ''` de proposito: as linhas antigas caem todas no balde
-- vazio, e como a trava velha ja garantia no maximo uma linha por
-- (automacao, pessoa), nao existe colisao possivel no preenchimento. E o balde
-- vazio nao colide com nenhuma ocasiao nova, entao quem estava bloqueado
-- passa a receber.
alter table deliveries
  add column if not exists janela text not null default '';

-- A trava velha precisa sair, senao ela continua bloqueando por cima da nova.
-- Soltar restricao nao apaga dado: e o oposto de destrutivo, e por isso o
-- db-setup permite. O nome e o que o Postgres gera a partir de db/schema.sql,
-- igual em toda instalacao, porque toda instalacao rodou o mesmo create table.
alter table deliveries
  drop constraint if exists deliveries_automation_id_ig_user_id_key;

create unique index if not exists deliveries_ocasiao_idx
  on deliveries (automation_id, ig_user_id, janela);
