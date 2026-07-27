-- FIDAI — pedidos PIX e acesso administrativo
-- Execute este arquivo completo no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  postal_code text not null check (char_length(postal_code) between 8 and 9),
  address text not null check (char_length(address) between 5 and 300),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal numeric(10,2) not null check (subtotal > 0),
  humanitarian_amount numeric(10,2) not null check (humanitarian_amount >= 0),
  payment_method text not null default 'pix' check (payment_method = 'pix'),
  payment_status text not null default 'reported'
    check (payment_status in ('reported','confirmed','rejected','refunded')),
  status text not null default 'payment_reported'
    check (status in ('payment_reported','payment_confirmed','preparing','shipped','completed','cancelled')),
  payment_reported_at timestamptz not null default now(),
  payment_confirmed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_user_id_idx on public.orders (user_id);

create or replace function public.is_fidai_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['arthurhgregorio@gmail.com','engenhariapalmer@gmail.com']::text[]
  );
$$;

revoke all on function public.is_fidai_admin() from public;
grant execute on function public.is_fidai_admin() to authenticated;

create or replace function public.set_fidai_order_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if new.payment_status = 'confirmed' and old.payment_status is distinct from 'confirmed' then
    new.payment_confirmed_at = coalesce(new.payment_confirmed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_fidai_order_updated_at on public.orders;
create trigger set_fidai_order_updated_at
before update on public.orders
for each row execute function public.set_fidai_order_updated_at();

alter table public.orders enable row level security;

drop policy if exists "Anyone may report a PIX order" on public.orders;
drop policy if exists "Customers may view their own orders" on public.orders;
drop policy if exists "FIDAI admins may view all orders" on public.orders;
drop policy if exists "FIDAI admins may update orders" on public.orders;
drop policy if exists "FIDAI admins may delete orders" on public.orders;

create policy "Anyone may report a PIX order"
on public.orders
for insert
to anon, authenticated
with check (
  payment_method = 'pix'
  and payment_status = 'reported'
  and status = 'payment_reported'
  and subtotal > 0
  and jsonb_array_length(items) > 0
  and (user_id is null or user_id = auth.uid())
);

create policy "Customers may view their own orders"
on public.orders
for select
to authenticated
using (user_id = auth.uid());

create policy "FIDAI admins may view all orders"
on public.orders
for select
to authenticated
using (public.is_fidai_admin());

create policy "FIDAI admins may update orders"
on public.orders
for update
to authenticated
using (public.is_fidai_admin())
with check (public.is_fidai_admin());

create policy "FIDAI admins may delete orders"
on public.orders
for delete
to authenticated
using (public.is_fidai_admin());

grant insert on public.orders to anon, authenticated;
grant select, update, delete on public.orders to authenticated;

comment on table public.orders is 'Pedidos FIDAI enviados após o cliente informar o pagamento via PIX.';
