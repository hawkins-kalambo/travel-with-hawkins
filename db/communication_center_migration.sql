-- Travel with Hawkins Communication Center schema
-- This migration adds conversation, notification, announcement, and support ticket capability.

create extension if not exists "pgcrypto";

create table if not exists public.communication_conversations (
    id uuid primary key default gen_random_uuid(),
    title text,
    conversation_type text not null default 'direct' check (conversation_type in ('direct', 'group', 'support')),
    status text not null default 'active' check (status in ('active', 'archived', 'closed')),
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists public.communication_conversation_participants (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'admin', 'member')),
    last_read_at timestamptz,
    starred boolean not null default false,
    archived boolean not null default false,
    deleted boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (conversation_id, profile_id)
);

create table if not exists public.communication_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.communication_conversations(id) on delete cascade,
    sender_id uuid not null references public.profiles(id) on delete cascade,
    body text not null,
    message_type text not null default 'text' check (message_type in ('text', 'system', 'attachment')),
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists public.communication_message_recipients (
    id uuid primary key default gen_random_uuid(),
    message_id uuid not null references public.communication_messages(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    unique (message_id, profile_id)
);

create table if not exists public.communication_notifications (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    type text not null,
    title text not null,
    message text not null,
    priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
    read_at timestamptz,
    related_type text,
    related_id text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.communication_announcements (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    body text not null,
    audience text not null default 'everyone' check (audience in ('everyone', 'admins', 'ambassadors', 'selected_users', 'selected_universities')),
    audience_scope jsonb default '[]'::jsonb,
    pinned boolean not null default false,
    published_at timestamptz not null default now(),
    expires_at timestamptz,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.communication_announcement_reads (
    id uuid primary key default gen_random_uuid(),
    announcement_id uuid not null references public.communication_announcements(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    read_at timestamptz not null default now(),
    unique (announcement_id, profile_id)
);

create table if not exists public.communication_support_tickets (
    id uuid primary key default gen_random_uuid(),
    subject text not null,
    category text not null default 'general' check (category in ('booking', 'commission', 'technical', 'payments', 'general', 'referral', 'account')),
    description text not null,
    priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
    status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'resolved', 'closed')),
    requester_id uuid not null references public.profiles(id) on delete cascade,
    assignee_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    resolved_at timestamptz
);

create table if not exists public.communication_ticket_replies (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.communication_support_tickets(id) on delete cascade,
    profile_id uuid not null references public.profiles(id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.communication_notification_preferences (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    email_enabled boolean not null default true,
    in_app_enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (profile_id)
);

create index if not exists idx_communication_conversations_updated_at on public.communication_conversations(updated_at desc);
create index if not exists idx_communication_conversation_participants_profile on public.communication_conversation_participants(profile_id);
create index if not exists idx_communication_messages_conversation on public.communication_messages(conversation_id, created_at desc);
create index if not exists idx_communication_notifications_profile on public.communication_notifications(profile_id, created_at desc);
create index if not exists idx_communication_notifications_unread on public.communication_notifications(profile_id, read_at);
create index if not exists idx_communication_announcements_published on public.communication_announcements(published_at desc);
create index if not exists idx_communication_support_tickets_status on public.communication_support_tickets(status, updated_at desc);
create index if not exists idx_communication_support_tickets_requester on public.communication_support_tickets(requester_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_communication_conversations_updated_at
before update on public.communication_conversations
for each row execute function public.set_updated_at();

create trigger trg_communication_conversation_participants_updated_at
before update on public.communication_conversation_participants
for each row execute function public.set_updated_at();

create trigger trg_communication_messages_updated_at
before update on public.communication_messages
for each row execute function public.set_updated_at();

create trigger trg_communication_notifications_updated_at
before update on public.communication_notifications
for each row execute function public.set_updated_at();

create trigger trg_communication_announcements_updated_at
before update on public.communication_announcements
for each row execute function public.set_updated_at();

create trigger trg_communication_support_tickets_updated_at
before update on public.communication_support_tickets
for each row execute function public.set_updated_at();

create trigger trg_communication_ticket_replies_updated_at
before update on public.communication_ticket_replies
for each row execute function public.set_updated_at();

create trigger trg_communication_notification_preferences_updated_at
before update on public.communication_notification_preferences
for each row execute function public.set_updated_at();

-- Storage bucket for communication attachments
insert into storage.buckets (id, name, public)
values ('communication-attachments', 'communication-attachments', true)
on conflict (id) do nothing;

-- Enable RLS
alter table public.communication_conversations enable row level security;
alter table public.communication_conversation_participants enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_message_recipients enable row level security;
alter table public.communication_notifications enable row level security;
alter table public.communication_announcements enable row level security;
alter table public.communication_announcement_reads enable row level security;
alter table public.communication_support_tickets enable row level security;
alter table public.communication_ticket_replies enable row level security;
alter table public.communication_notification_preferences enable row level security;

create policy if not exists communication_conversations_select on public.communication_conversations
for select using (
  exists (
    select 1 from public.communication_conversation_participants p
    where p.conversation_id = communication_conversations.id
      and p.profile_id = auth.uid()
      and p.deleted = false
  )
  or exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.role in ('admin', 'super_admin')
  )
);

create policy if not exists communication_conversations_insert on public.communication_conversations
for insert with check (auth.uid() is not null);

create policy if not exists communication_conversation_participants_select on public.communication_conversation_participants
for select using (
  profile_id = auth.uid()
  or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin', 'super_admin'))
);

create policy if not exists communication_messages_select on public.communication_messages
for select using (
  exists (
    select 1 from public.communication_conversation_participants p
    where p.conversation_id = communication_messages.conversation_id
      and p.profile_id = auth.uid()
      and p.deleted = false
  )
  or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin', 'super_admin'))
);

create policy if not exists communication_messages_insert on public.communication_messages
for insert with check (sender_id = auth.uid());

create policy if not exists communication_notifications_select on public.communication_notifications
for select using (
  profile_id = auth.uid()
  or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin', 'super_admin'))
);

create policy if not exists communication_notifications_update on public.communication_notifications
for update using (profile_id = auth.uid());

create policy if not exists communication_announcements_select on public.communication_announcements
for select using (
  audience = 'everyone'
  or (
    audience = 'admins'
    and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin', 'super_admin'))
  )
  or (
    audience = 'ambassadors'
    and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'ambassador')
  )
  or (
    audience = 'selected_users'
    and exists (
      select 1 from public.communication_announcement_reads r
      where r.announcement_id = communication_announcements.id and r.profile_id = auth.uid()
    )
  )
);

create policy if not exists communication_support_tickets_select on public.communication_support_tickets
for select using (
  requester_id = auth.uid()
  or assignee_id = auth.uid()
  or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin', 'super_admin'))
);

create policy if not exists communication_support_tickets_insert on public.communication_support_tickets
for insert with check (requester_id = auth.uid());

create policy if not exists communication_ticket_replies_select on public.communication_ticket_replies
for select using (
  exists (
    select 1 from public.communication_support_tickets t
    where t.id = communication_ticket_replies.ticket_id
      and (
        t.requester_id = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin', 'super_admin'))
      )
  )
);

create policy if not exists communication_ticket_replies_insert on public.communication_ticket_replies
for insert with check (profile_id = auth.uid());
