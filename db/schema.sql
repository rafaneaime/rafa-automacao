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
  unique (automation_id, ig_user_id)
);

create table if not exists webhook_events (
  id              serial primary key,
  received_at     timestamptz default now(),
  signature_valid boolean not null,
  raw             text not null,
  processed_at    timestamptz,
  error           text
);

create index if not exists deliveries_created_idx on deliveries (created_at desc);
create index if not exists webhook_events_received_idx on webhook_events (received_at desc);
