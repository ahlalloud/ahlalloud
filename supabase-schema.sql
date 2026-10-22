-- Run in Supabase SQL Editor. Review before applying to production.
create extension if not exists pgcrypto;
create table if not exists public.store_admins(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.products(id uuid primary key default gen_random_uuid(),name_ar text not null,description_short text,description text,price_jod numeric(10,2) check(price_jod is null or price_jod>=0),size text,category text,image_url text,status text not null default 'draft' check(status in ('draft','published')),sort_order integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.store_admins enable row level security;
alter table public.products enable row level security;
drop policy if exists "admins can read own admin record" on public.store_admins;
create policy "admins can read own admin record" on public.store_admins for select to authenticated using(user_id=auth.uid());
drop policy if exists "public can read published products" on public.products;
create policy "public can read published products" on public.products for select to anon,authenticated using(status='published' or exists(select 1 from public.store_admins a where a.user_id=auth.uid()));
drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products for all to authenticated using(exists(select 1 from public.store_admins a where a.user_id=auth.uid())) with check(exists(select 1 from public.store_admins a where a.user_id=auth.uid()));
insert into storage.buckets(id,name,public) values('product-images','product-images',true) on conflict(id) do nothing;
drop policy if exists "public can view product images" on storage.objects;
create policy "public can view product images" on storage.objects for select to anon,authenticated using(bucket_id='product-images');
drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects for insert to authenticated with check(bucket_id='product-images' and exists(select 1 from public.store_admins a where a.user_id=auth.uid()));
drop policy if exists "admins update product images" on storage.objects;
create policy "admins update product images" on storage.objects for update to authenticated using(bucket_id='product-images' and exists(select 1 from public.store_admins a where a.user_id=auth.uid())) with check(bucket_id='product-images' and exists(select 1 from public.store_admins a where a.user_id=auth.uid()));
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects for delete to authenticated using(bucket_id='product-images' and exists(select 1 from public.store_admins a where a.user_id=auth.uid()));
-- After creating the owner account in Supabase Auth, run this with that user's real UUID:
-- insert into public.store_admins(user_id) values('REPLACE-WITH-AUTH-USER-UUID');