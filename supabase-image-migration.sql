-- AHL AL-OUD image preservation metadata migration
-- Run once in Supabase SQL Editor before using the updated admin form.
alter table public.products add column if not exists original_image_url text;
alter table public.products add column if not exists image_mode text not null default 'original' check (image_mode in ('original','white','luxury','remove'));
update public.products set original_image_url=image_url where original_image_url is null and image_url is not null;
