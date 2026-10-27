create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  storage_path text not null unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_order_idx
  on public.product_images (user_id, product_id, sort_order);

create unique index if not exists product_images_single_cover_idx
  on public.product_images (user_id, product_id)
  where is_cover;

alter table public.product_images enable row level security;

drop policy if exists "Users can read their product images" on public.product_images;
create policy "Users can read their product images"
  on public.product_images for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add their product images" on public.product_images;
create policy "Users can add their product images"
  on public.product_images for insert to authenticated
  with check (
    auth.uid() = user_id
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.business_records as product
      where product.user_id = auth.uid()
        and product.collection = 'productos'
        and product.record_id = product_id
    )
  );

drop policy if exists "Users can update their product images" on public.product_images;
create policy "Users can update their product images"
  on public.product_images for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );

drop policy if exists "Users can delete their product images" on public.product_images;
create policy "Users can delete their product images"
  on public.product_images for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.product_images to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload product images" on storage.objects;
create policy "Users can upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update product images" on storage.objects;
create policy "Users can update product images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete product images" on storage.objects;
create policy "Users can delete product images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.set_product_image_cover(
  p_product_id text,
  p_image_id uuid
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

  if not exists (
    select 1
    from public.product_images
    where id = p_image_id
      and product_id = p_product_id
      and user_id = auth.uid()
  ) then
    raise exception 'Image does not belong to this product';
  end if;

  update public.product_images
  set is_cover = false
  where user_id = auth.uid()
    and product_id = p_product_id
    and is_cover;

  update public.product_images
  set is_cover = true
  where id = p_image_id
    and user_id = auth.uid()
    and product_id = p_product_id;
end;
$$;

grant execute on function public.set_product_image_cover(text, uuid) to authenticated;

create or replace function public.set_product_image_order(
  p_product_id text,
  p_image_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  product_image_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select count(*) into product_image_count
  from public.product_images
  where user_id = auth.uid()
    and product_id = p_product_id;

  if coalesce(cardinality(p_image_ids), 0) <> product_image_count
     or (
       select count(distinct image_id)
       from unnest(coalesce(p_image_ids, array[]::uuid[])) as requested(image_id)
     ) <> product_image_count
     or exists (
       select 1
       from unnest(coalesce(p_image_ids, array[]::uuid[])) as requested(image_id)
       left join public.product_images as image
         on image.id = requested.image_id
        and image.user_id = auth.uid()
        and image.product_id = p_product_id
       where image.id is null
     ) then
    raise exception 'Image order must contain every image for this product exactly once';
  end if;

  update public.product_images as image
  set sort_order = requested.position - 1
  from unnest(p_image_ids) with ordinality as requested(image_id, position)
  where image.id = requested.image_id
    and image.user_id = auth.uid()
    and image.product_id = p_product_id;
end;
$$;

grant execute on function public.set_product_image_order(text, uuid[]) to authenticated;

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
  and coalesce((records.payload ->> 'activo')::boolean, true)
  and coalesce(nullif(records.payload ->> 'stock', '')::numeric, 0) > 0;

create or replace view public.public_catalog_images
with (security_barrier = true)
as
select
  images.id,
  images.product_id,
  images.storage_path,
  images.sort_order,
  images.is_cover
from public.product_images as images
join public.public_catalog_owner as owner on owner.user_id = images.user_id
join public.business_records as product
  on product.user_id = images.user_id
 and product.collection = 'productos'
 and product.record_id = images.product_id
where coalesce((product.payload ->> 'activo')::boolean, true)
  and coalesce(nullif(product.payload ->> 'stock', '')::numeric, 0) > 0;

grant select on public.public_catalog to anon, authenticated;
grant select on public.public_catalog_images to anon, authenticated;
