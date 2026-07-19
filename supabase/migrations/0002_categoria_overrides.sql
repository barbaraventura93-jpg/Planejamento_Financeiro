-- Correções de categoria aprendidas (feedback do usuário) + permissão de editar
-- a categoria de um lançamento já salvo. Esta é a primeira migration que a
-- automação do GitHub Actions realmente aplica no banco em produção.

create table if not exists categoria_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  category text not null,
  created_at timestamptz default now(),
  unique (user_id, pattern)
);

alter table categoria_overrides enable row level security;

create policy "overrides_select_own" on categoria_overrides for select using (auth.uid() = user_id);
create policy "overrides_upsert_own" on categoria_overrides for insert with check (auth.uid() = user_id);
create policy "overrides_update_own" on categoria_overrides for update using (auth.uid() = user_id);
create policy "overrides_delete_own" on categoria_overrides for delete using (auth.uid() = user_id);

create policy "lancamentos_update_own" on lancamentos for update using (auth.uid() = user_id);
