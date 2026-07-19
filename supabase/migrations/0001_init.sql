-- Baseline: reflete o schema já aplicado manualmente no SQL Editor (ver supabase/schema.sql
-- histórico). Este arquivo existe só para o Supabase CLI ter um ponto de partida — em um
-- projeto que já rodou o schema.sql na mão, esta migration é marcada como "já aplicada"
-- (veja README, seção "Atualização automática do banco"), não é executada de novo.

create table if not exists faturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  closing date,
  total numeric(12,2) not null default 0,
  installments_committed numeric(12,2) default 0,
  revolving_used boolean default false,
  notes text,
  created_at timestamptz default now()
);

create table if not exists fatura_cards (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  card_label text not null,
  value numeric(12,2) not null default 0
);

create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  value numeric(12,2) not null,
  category text not null,
  confidence text,
  created_at timestamptz default now()
);

create table if not exists financeiro_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric(12,2) default 0,
  emergency_goal numeric(12,2) default 30000,
  emergency_saved numeric(12,2) default 0,
  updated_at timestamptz default now()
);

alter table faturas enable row level security;
alter table fatura_cards enable row level security;
alter table lancamentos enable row level security;
alter table financeiro_config enable row level security;

create policy "faturas_select_own" on faturas for select using (auth.uid() = user_id);
create policy "faturas_insert_own" on faturas for insert with check (auth.uid() = user_id);
create policy "faturas_update_own" on faturas for update using (auth.uid() = user_id);
create policy "faturas_delete_own" on faturas for delete using (auth.uid() = user_id);

create policy "fatura_cards_select_own" on fatura_cards for select
  using (exists (select 1 from faturas f where f.id = fatura_cards.fatura_id and f.user_id = auth.uid()));
create policy "fatura_cards_insert_own" on fatura_cards for insert
  with check (exists (select 1 from faturas f where f.id = fatura_cards.fatura_id and f.user_id = auth.uid()));
create policy "fatura_cards_delete_own" on fatura_cards for delete
  using (exists (select 1 from faturas f where f.id = fatura_cards.fatura_id and f.user_id = auth.uid()));

create policy "lancamentos_select_own" on lancamentos for select using (auth.uid() = user_id);
create policy "lancamentos_insert_own" on lancamentos for insert with check (auth.uid() = user_id);
create policy "lancamentos_delete_own" on lancamentos for delete using (auth.uid() = user_id);

create policy "config_select_own" on financeiro_config for select using (auth.uid() = user_id);
create policy "config_upsert_own" on financeiro_config for insert with check (auth.uid() = user_id);
create policy "config_update_own" on financeiro_config for update using (auth.uid() = user_id);
