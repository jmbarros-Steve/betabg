create table if not exists public.ad_assets (
  id uuid default gen_random_uuid() primary key,
  creative_id uuid references public.ad_creatives(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  asset_url text,
  tipo text default 'imagen',
  created_at timestamp with time zone default now()
);

alter table public.ad_assets enable row level security;

create policy "Clients can insert their own ad assets"
  on public.ad_assets for insert
  with check (exists (
    select 1 from public.clients
    where clients.id = ad_assets.client_id
      and (clients.client_user_id = auth.uid() or clients.user_id = auth.uid())
  ));

create policy "Clients can view their own ad assets"
  on public.ad_assets for select
  using (exists (
    select 1 from public.clients
    where clients.id = ad_assets.client_id
      and (clients.client_user_id = auth.uid() or clients.user_id = auth.uid())
  ));

create policy "Super admins manage all ad assets"
  on public.ad_assets for all
  using (is_super_admin(auth.uid()));