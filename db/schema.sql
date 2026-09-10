create table if not exists accounts (
  id                serial primary key,
  ig_user_id        text unique not null,
  username          text,
  access_token      text not null,
  token_expires_at  timestamptz,
  created_at        timestamptz default now()
);

create table if not exists automations (
  id            serial primary key,
  account_id    int references accounts(id) on delete cascade,
  name          text not null,
  status        text not null default 'draft',
  trigger_type  text not null,
  media_id      text,
  keywords      text[] not null default '{}',
  match_mode    text not null default 'contains',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists automation_steps (
  id             serial primary key,
  automation_id  int references automations(id) on delete cascade,
  position       int not null,
  kind           text not null,
  variants       text[] not null default '{}',
  buttons        jsonb not null default '[]'
);

create table if not exists contacts (
  id            serial primary key,
  account_id    int references accounts(id) on delete cascade,
  ig_user_id    text not null,
  username      text,
  nome          text,
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now(),
  unique (account_id, ig_user_id)
);

create table if not exists deliveries (
  id             serial primary key,
  automation_id  int references automations(id) on delete cascade,
  ig_user_id     text not null,
  comment_id     text,
  status         text not null default 'pending',
  error          text,
  created_at     timestamptz default now(),

  -- A ocasiao desta entrega: `post:<media_id>` quando o comentario diz de qual
  -- post veio, `dia:<YYYY-MM-DD>` quando nao. Ver src/lib/automations/janela.ts.
  --
  -- A unicidade antiga era (automation_id, ig_user_id) e valia PARA SEMPRE:
  -- quem ja tinha recebido uma automacao uma vez nunca mais recebia, mesmo
  -- comentando em outro post semanas depois. A migracao 011 desfaz isso em
  -- quem ja instalou. Aqui a tabela ja nasce certa.
  janela         text not null default ''
);

-- O índice de (automation_id, ig_user_id, janela) NÃO mora aqui. Ele é criado
-- pela migração 011, junto da coluna `janela`, e o motivo é ordem:
--
-- o `db-setup` aplica este arquivo ANTES das migrações. Numa instalação que já
-- existia antes da 011, `create table if not exists deliveries` não faz nada
-- (a tabela já está lá, sem a coluna), e o índice logo abaixo tentava usar uma
-- coluna que só a migração 011 acrescenta — três linhas depois, tarde demais.
--
-- O resultado era o build inteiro morrer com `column "janela" does not exist`,
-- em toda instalação anterior à 011. Instalação nova passava, porque aí o
-- `create table` acima roda de verdade e já traz a coluna. Um defeito que só
-- aparecia em quem já era cliente.
--
-- Provado na instalação da Amanda, atualizando para a Plataforma em 04/09.

create table if not exists webhook_events (
  id              serial primary key,
  received_at     timestamptz default now(),
  signature_valid boolean not null,
  raw             text not null,
  processed_at    timestamptz,
  error           text
);

create table if not exists follow_ups_sent (
  id           serial primary key,
  delivery_id  int references deliveries(id) on delete cascade,
  position     int not null,
  sent_at      timestamptz default now(),
  unique (delivery_id, position)
);

-- Mensagens já processadas, para o Meta reentregar sem a pessoa receber duas
-- vezes.
--
-- A trava de deliveries protege a DM original, mas não a continuação da
-- conversa: numa reentrega, o sistema via a mensagem 1 já enviada, escolhia a
-- 2 e mandava — duas mensagens de uma resposta só, sem erro nenhum aparecer.
-- O `mid` é a única coisa estável que a reentrega traz igual.
create table if not exists processed_messages (
  id           serial primary key,
  account_id   int references accounts(id) on delete cascade,
  mid          text not null,
  processed_at timestamptz default now(),
  unique (account_id, mid)
);

create index if not exists deliveries_created_idx on deliveries (created_at desc);
create index if not exists webhook_events_received_idx on webhook_events (received_at desc);
