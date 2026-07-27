-- FIDAI — pedidos PIX e acesso administrativo
-- Execute este arquivo completo no SQL Editor do projeto Supabase.
-- O script é idempotente: pode ser executado novamente após futuras atualizações.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_reference uuid not null default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  postal_code text not null check (char_length(postal_code) between 8 and 20),
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
  tracking_code text null,
  admin_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists client_reference uuid;
alter table public.orders add column if not exists tracking_code text;
alter table public.orders add column if not exists admin_notes text;

update public.orders
set client_reference = gen_random_uuid()
where client_reference is null;

alter table public.orders alter column client_reference set default gen_random_uuid();
alter table public.orders alter column client_reference set not null;

create unique index if not exists orders_client_reference_uidx on public.orders (client_reference);
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

  if new.status in ('payment_confirmed', 'preparing', 'shipped', 'completed') then
    new.payment_status = 'confirmed';
    new.payment_confirmed_at = coalesce(new.payment_confirmed_at, now());
  elsif new.status = 'payment_reported' then
    new.payment_status = 'reported';
    new.payment_confirmed_at = null;
  elsif new.status = 'cancelled' and old.payment_status <> 'confirmed' then
    new.payment_status = 'rejected';
  end if;

  return new;
end;
$$;

drop trigger if exists set_fidai_order_updated_at on public.orders;
create trigger set_fidai_order_updated_at
before update on public.orders
for each row execute function public.set_fidai_order_updated_at();

create or replace function public.report_fidai_pix_order(
  p_client_reference uuid,
  p_customer_name text,
  p_customer_email text,
  p_postal_code text,
  p_address text,
  p_items jsonb
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference uuid := coalesce(p_client_reference, gen_random_uuid());
  v_existing_id uuid;
  v_existing_created_at timestamptz;
  v_item jsonb;
  v_product_id integer;
  v_quantity integer;
  v_price numeric(10,2);
  v_product_name text;
  v_product_type text;
  v_normalized_items jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_order_id uuid;
  v_created_at timestamptz;
begin
  select orders.id, orders.created_at
  into v_existing_id, v_existing_created_at
  from public.orders
  where client_reference = v_reference;

  if found then
    return query select v_existing_id, v_existing_created_at;
    return;
  end if;

  if char_length(trim(coalesce(p_customer_name, ''))) not between 2 and 120 then
    raise exception 'Nome do cliente inválido.';
  end if;

  if char_length(trim(coalesce(p_customer_email, ''))) not between 5 and 254
     or position('@' in p_customer_email) = 0 then
    raise exception 'E-mail do cliente inválido.';
  end if;

  if char_length(trim(coalesce(p_postal_code, ''))) not between 8 and 20 then
    raise exception 'CEP inválido.';
  end if;

  if char_length(trim(coalesce(p_address, ''))) not between 5 and 300 then
    raise exception 'Endereço inválido.';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Itens do pedido inválidos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::integer;
      v_quantity := greatest(1, least(20, coalesce((v_item ->> 'quantity')::integer, 1)));
    exception when others then
      raise exception 'Produto ou quantidade inválidos.';
    end;

    case v_product_id
      when 1 then v_product_name := 'Essential Black'; v_product_type := 'Camisa oversized'; v_price := 129;
      when 2 then v_product_name := 'Essential Off-White'; v_product_type := 'Camisa oversized'; v_price := 139;
      when 3 then v_product_name := 'Essential Graphite'; v_product_type := 'Camisa oversized'; v_price := 149;
      when 4 then v_product_name := 'Training Black'; v_product_type := 'Regata training'; v_price := 119;
      when 5 then v_product_name := 'Training White'; v_product_type := 'Regata training'; v_price := 119;
      when 6 then v_product_name := 'Training Graphite'; v_product_type := 'Regata training'; v_price := 129;
      when 7 then v_product_name := 'Crewneck Black'; v_product_type := 'Moletom crewneck'; v_price := 239;
      when 8 then v_product_name := 'Crewneck White'; v_product_type := 'Moletom crewneck'; v_price := 239;
      when 9 then v_product_name := 'Crewneck Graphite'; v_product_type := 'Moletom crewneck'; v_price := 249;
      else raise exception 'Produto FIDAI inválido: %', v_product_id;
    end case;

    v_normalized_items := v_normalized_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id,
        'product_name', v_product_name,
        'product_type', v_product_type,
        'size', left(coalesce(nullif(trim(v_item ->> 'size'), ''), 'M'), 12),
        'print_id', left(coalesce(nullif(trim(v_item ->> 'print_id'), ''), 'sem-estampa'), 120),
        'print_name', left(coalesce(nullif(trim(v_item ->> 'print_name'), ''), 'Sem estampa'), 160),
        'quantity', v_quantity,
        'unit_price', v_price,
        'line_total', v_price * v_quantity
      )
    );

    v_subtotal := v_subtotal + (v_price * v_quantity);
  end loop;

  insert into public.orders as new_order (
    client_reference,
    user_id,
    customer_name,
    customer_email,
    postal_code,
    address,
    items,
    subtotal,
    humanitarian_amount,
    payment_method,
    payment_status,
    status,
    payment_reported_at
  ) values (
    v_reference,
    auth.uid(),
    trim(p_customer_name),
    lower(trim(p_customer_email)),
    trim(p_postal_code),
    trim(p_address),
    v_normalized_items,
    v_subtotal,
    round(v_subtotal * 0.20, 2),
    'pix',
    'reported',
    'payment_reported',
    now()
  )
  returning new_order.id, new_order.created_at into v_order_id, v_created_at;

  return query select v_order_id, v_created_at;
end;
$$;

revoke all on function public.report_fidai_pix_order(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.report_fidai_pix_order(uuid, text, text, text, text, jsonb) to anon, authenticated;

alter table public.orders enable row level security;

drop policy if exists "Anyone may report a PIX order" on public.orders;
drop policy if exists "Customers may view their own orders" on public.orders;
drop policy if exists "FIDAI admins may view all orders" on public.orders;
drop policy if exists "FIDAI admins may update orders" on public.orders;
drop policy if exists "FIDAI admins may delete orders" on public.orders;

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

revoke insert on public.orders from anon, authenticated;
grant select, update, delete on public.orders to authenticated;

comment on table public.orders is 'Pedidos FIDAI enviados depois que o cliente informa o pagamento via PIX.';
comment on function public.report_fidai_pix_order(uuid, text, text, text, text, jsonb)
is 'Registra um pedido PIX com preços validados no servidor e retorna o número do pedido.';
