-- Rode isso no SQL Editor do Supabase (Project > SQL Editor > New query)

-- ---------- faturas mensais ----------
create table if not exists faturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  closing date,
  total numeric(12,2) not null default 0,
  installments_committed numeric(12,2) default 0,
  bank_balance numeric(12,2),
  revolving_used boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- ---------- gasto por cartão dentro de uma fatura ----------
create table if not exists fatura_cards (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas(id) on delete cascade,
  card_label text not null,
  value numeric(12,2) not null default 0
);

-- ---------- lançamentos individuais classificados ----------
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

-- ---------- config pessoal: renda, meta de reserva, valor guardado ----------
create table if not exists financeiro_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric(12,2) default 0,
  emergency_goal numeric(12,2) default 30000,
  emergency_saved numeric(12,2) default 0,
  updated_at timestamptz default now()
);

-- ---------- posições de investimento (patrimônio líquido) ----------
create table if not exists investimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  value numeric(14,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- correções de categoria aprendidas (feedback do usuário) ----------
create table if not exists categoria_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  category text not null,
  created_at timestamptz default now(),
  unique (user_id, pattern)
);

-- ============ Row Level Security ============
alter table faturas enable row level security;
alter table fatura_cards enable row level security;
alter table lancamentos enable row level security;
alter table financeiro_config enable row level security;
alter table investimentos enable row level security;
alter table categoria_overrides enable row level security;

-- faturas: cada usuário só vê/edita as próprias
create policy "faturas_select_own" on faturas for select using (auth.uid() = user_id);
create policy "faturas_insert_own" on faturas for insert with check (auth.uid() = user_id);
create policy "faturas_update_own" on faturas for update using (auth.uid() = user_id);
create policy "faturas_delete_own" on faturas for delete using (auth.uid() = user_id);

-- fatura_cards: segue o dono da fatura pai
create policy "fatura_cards_select_own" on fatura_cards for select
  using (exists (select 1 from faturas f where f.id = fatura_cards.fatura_id and f.user_id = auth.uid()));
create policy "fatura_cards_insert_own" on fatura_cards for insert
  with check (exists (select 1 from faturas f where f.id = fatura_cards.fatura_id and f.user_id = auth.uid()));
create policy "fatura_cards_delete_own" on fatura_cards for delete
  using (exists (select 1 from faturas f where f.id = fatura_cards.fatura_id and f.user_id = auth.uid()));

-- lancamentos: mesma lógica, direto pelo user_id
create policy "lancamentos_select_own" on lancamentos for select using (auth.uid() = user_id);
create policy "lancamentos_insert_own" on lancamentos for insert with check (auth.uid() = user_id);
create policy "lancamentos_update_own" on lancamentos for update using (auth.uid() = user_id);
create policy "lancamentos_delete_own" on lancamentos for delete using (auth.uid() = user_id);

-- financeiro_config: uma linha por usuário
create policy "config_select_own" on financeiro_config for select using (auth.uid() = user_id);
create policy "config_upsert_own" on financeiro_config for insert with check (auth.uid() = user_id);
create policy "config_update_own" on financeiro_config for update using (auth.uid() = user_id);

-- investimentos: cada usuário só vê/edita os próprios
create policy "investimentos_select_own" on investimentos for select using (auth.uid() = user_id);
create policy "investimentos_insert_own" on investimentos for insert with check (auth.uid() = user_id);
create policy "investimentos_update_own" on investimentos for update using (auth.uid() = user_id);
create policy "investimentos_delete_own" on investimentos for delete using (auth.uid() = user_id);

-- categoria_overrides: cada usuário só vê/edita as próprias correções
create policy "overrides_select_own" on categoria_overrides for select using (auth.uid() = user_id);
create policy "overrides_upsert_own" on categoria_overrides for insert with check (auth.uid() = user_id);
create policy "overrides_update_own" on categoria_overrides for update using (auth.uid() = user_id);
create policy "overrides_delete_own" on categoria_overrides for delete using (auth.uid() = user_id);
