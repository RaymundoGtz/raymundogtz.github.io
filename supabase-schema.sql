create table if not exists public.ledgers (
  room_code text primary key,
  people jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ledgers enable row level security;

create policy "Anyone can read the shared canteen ledger"
on public.ledgers for select
using (true);

create policy "Anyone can create the shared canteen ledger"
on public.ledgers for insert
with check (true);

create policy "Anyone can update the shared canteen ledger"
on public.ledgers for update
using (true)
with check (true);

insert into public.ledgers (room_code)
values ('bosch-canteen')
on conflict (room_code) do nothing;
