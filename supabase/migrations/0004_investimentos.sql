-- Posições de investimento do usuário (nome, tipo e valor atual).
-- Usadas na seção de patrimônio líquido: investimentos + reserva + saldo em conta.
create table if not exists investimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  value numeric(14,2) not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table investimentos enable row level security;

create policy "investimentos_select_own" on investimentos for select using (auth.uid() = user_id);
create policy "investimentos_insert_own" on investimentos for insert with check (auth.uid() = user_id);
create policy "investimentos_update_own" on investimentos for update using (auth.uid() = user_id);
create policy "investimentos_delete_own" on investimentos for delete using (auth.uid() = user_id);
