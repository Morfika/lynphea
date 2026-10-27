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
        or not exists (
          select 1
          from regexp_split_to_table(lower(btrim(p_search)), '\s+') as query_token(token)
          where query_token.token <> ''
            and position(
              query_token.token
              in lower(
                coalesce(records.payload ->> 'sku', '') || ' ' ||
                coalesce(records.payload ->> 'nombre', '') || ' ' ||
                coalesce(records.payload ->> 'proveedor', '')
              )
            ) = 0
        )
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

create or replace function public.search_public_catalog(
  p_search text default '',
  p_linea text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select catalog.id, catalog.sku, catalog.nombre, catalog.descripcion, catalog.linea, catalog.precio
    from public.public_catalog as catalog
    where (p_linea is null or catalog.linea = p_linea)
      and (
        nullif(btrim(p_search), '') is null
        or not exists (
          select 1
          from regexp_split_to_table(lower(btrim(p_search)), '\s+') as query_token(token)
          where query_token.token <> ''
            and position(
              query_token.token
              in lower(
                coalesce(catalog.sku, '') || ' ' ||
                coalesce(catalog.nombre, '') || ' ' ||
                coalesce(catalog.descripcion, '')
              )
            ) = 0
        )
      )
  ),
  paged as (
    select filtered.id, filtered.sku, filtered.nombre, filtered.descripcion, filtered.linea, filtered.precio
    from filtered
    order by lower(coalesce(filtered.nombre, '')), filtered.id
    limit greatest(1, least(coalesce(p_limit, 24), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'totalCount', (select count(*) from filtered),
    'products', coalesce(
      (
        select jsonb_agg(
          to_jsonb(paged)
          order by lower(coalesce(paged.nombre, '')), paged.id
        )
        from paged
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function public.search_business_products(text, text, text, integer, integer)
  to authenticated;
grant execute on function public.search_public_catalog(text, text, integer, integer)
  to anon, authenticated;
