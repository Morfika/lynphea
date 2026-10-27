create table if not exists public.business_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (
    collection in (
      'productos',
      'ventas',
      'compras',
      'gastos',
      'clientes',
      'pagos',
      'periodos',
      'documentos',
      'settings'
    )
  ),
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);

alter table public.business_records enable row level security;

create policy "Users can read their business records"
  on public.business_records for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their business records"
  on public.business_records for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their business records"
  on public.business_records for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their business records"
  on public.business_records for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.business_records to authenticated;

create table if not exists public.public_catalog_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);

alter table public.public_catalog_owner enable row level security;

create or replace function public.claim_public_catalog_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.collection = 'productos' then
    insert into public.public_catalog_owner (singleton, user_id)
    values (true, new.user_id)
    on conflict (singleton) do nothing;
  end if;
  return new;
end;
$$;

create trigger set_public_catalog_owner
  after insert on public.business_records
  for each row execute function public.claim_public_catalog_owner();

create or replace function public.replace_business_records(
  p_collection text,
  p_records jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_collection is null or p_collection not in (
    'productos', 'ventas', 'compras', 'gastos', 'clientes',
    'pagos', 'periodos', 'documentos', 'settings'
  ) then
    raise exception 'Invalid business collection';
  end if;

  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'Records must be a JSON array';
  end if;

  delete from public.business_records
  where user_id = auth.uid()
    and collection = p_collection;

  insert into public.business_records (user_id, collection, record_id, payload)
  select auth.uid(), p_collection, record_id, payload
  from jsonb_to_recordset(p_records) as records(record_id text, payload jsonb);
end;
$$;

grant execute on function public.replace_business_records(text, jsonb) to authenticated;

create or replace function public.import_local_business_records(p_records jsonb)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Records must be a JSON array';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  if exists (
    select 1 from public.business_records where user_id = auth.uid()
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_records) as records(
      collection text,
      record_id text,
      payload jsonb
    )
    where collection is null
      or collection not in (
        'productos', 'ventas', 'compras', 'gastos', 'clientes',
        'pagos', 'periodos', 'documentos', 'settings'
      )
      or record_id is null
      or payload is null
  ) then
    raise exception 'Invalid business record in import';
  end if;

  insert into public.business_records (user_id, collection, record_id, payload)
  select auth.uid(), collection, record_id, payload
  from jsonb_to_recordset(p_records) as records(
    collection text,
    record_id text,
    payload jsonb
  );

  return true;
end;
$$;

grant execute on function public.import_local_business_records(jsonb) to authenticated;

create or replace view public.public_catalog
with (security_barrier = true)
as
select
  records.record_id as id,
  records.payload ->> 'sku' as sku,
  records.payload ->> 'nombre' as nombre,
  records.payload ->> 'descripcion' as descripcion,
  records.payload ->> 'linea' as linea,
  nullif(records.payload ->> 'precio', '')::numeric as precio
from public.business_records as records
join public.public_catalog_owner as owner on owner.user_id = records.user_id
where records.collection = 'productos'
  and coalesce((records.payload ->> 'activo')::boolean, true);

grant select on public.public_catalog to anon, authenticated;
