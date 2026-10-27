create or replace function public.search_business_products(
  p_search text default '',
  p_linea text default null,
  p_proveedor text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select records.record_id, records.payload
    from public.business_records as records
    where records.user_id = auth.uid()
      and records.collection = 'productos'
      and (
        nullif(btrim(p_search), '') is null
        or position(
          lower(btrim(p_search))
          in lower(
            coalesce(records.payload ->> 'sku', '') || ' ' ||
            coalesce(records.payload ->> 'nombre', '') || ' ' ||
            coalesce(records.payload ->> 'proveedor', '')
          )
        ) > 0
      )
      and (p_linea is null or records.payload ->> 'linea' = p_linea)
      and (
        p_proveedor is null
        or coalesce(records.payload ->> 'proveedor', 'OTRO') = p_proveedor
      )
  ),
  paged as (
    select filtered.record_id, filtered.payload
    from filtered
    order by lower(coalesce(filtered.payload ->> 'sku', '')), filtered.record_id
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'totalCount', (select count(*) from filtered),
    'products', coalesce(
      (
        select jsonb_agg(
          paged.payload
          order by lower(coalesce(paged.payload ->> 'sku', '')), paged.record_id
        )
        from paged
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.save_business_product(
  p_record_id text,
  p_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_record_id is null
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload ->> 'id' is distinct from p_record_id
    or nullif(btrim(p_payload ->> 'sku'), '') is null
    or nullif(btrim(p_payload ->> 'nombre'), '') is null then
    raise exception 'Invalid product record';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':productos', 0));

  if exists (
    select 1
    from public.business_records as existing
    where existing.user_id = auth.uid()
      and existing.collection = 'productos'
      and existing.record_id <> p_record_id
      and lower(btrim(existing.payload ->> 'sku')) = lower(btrim(p_payload ->> 'sku'))
  ) then
    raise exception 'Ya existe un producto con ese SKU';
  end if;

  insert into public.business_records (user_id, collection, record_id, payload)
  values (auth.uid(), 'productos', p_record_id, p_payload)
  on conflict (user_id, collection, record_id)
  do update set payload = excluded.payload, updated_at = now();
end;
$$;

create or replace function public.delete_business_product(p_record_id text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  delete from public.business_records
  where user_id = auth.uid()
    and collection = 'productos'
    and record_id = p_record_id;
end;
$$;

create or replace function public.seed_default_business_products(p_records jsonb)
returns void
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
  if exists (
    select 1
    from jsonb_to_recordset(p_records) as records(record_id text, payload jsonb)
    where records.record_id is null
      or jsonb_typeof(records.payload) <> 'object'
      or nullif(btrim(records.payload ->> 'sku'), '') is null
  ) then
    raise exception 'Invalid default product record';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':productos', 0));

  insert into public.business_records (user_id, collection, record_id, payload)
  select auth.uid(), 'productos', records.record_id, records.payload
  from jsonb_to_recordset(p_records) as records(record_id text, payload jsonb)
  where not exists (
    select 1
    from public.business_records as existing
    where existing.user_id = auth.uid()
      and existing.collection = 'productos'
      and (
        existing.record_id = records.record_id
        or lower(btrim(existing.payload ->> 'sku')) =
          lower(btrim(records.payload ->> 'sku'))
      )
  )
  on conflict (user_id, collection, record_id) do nothing;
end;
$$;

grant execute on function public.search_business_products(text, text, text, integer, integer)
  to authenticated;
grant execute on function public.save_business_product(text, jsonb) to authenticated;
grant execute on function public.delete_business_product(text) to authenticated;
grant execute on function public.seed_default_business_products(jsonb) to authenticated;
