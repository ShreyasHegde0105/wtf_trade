
-- Required by POST /internal/scores. The webhook writes history with
-- ON CONFLICT (symbol, updated_at) DO NOTHING, so a retried delivery is ignored instead of
-- duplicated. Without this constraint those writes fail. Safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'momentum_score_history_symbol_updated_at_key'
      and conrelid = 'public.momentum_score_history'::regclass
  ) then
    alter table public.momentum_score_history
      add constraint momentum_score_history_symbol_updated_at_key unique (symbol, updated_at);
  end if;
end $$;
