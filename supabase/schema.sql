-- Supplier Payment Desk schema. Safe to re-run: drops and recreates the app tables.
-- Security model:
--   * Supplier users sign in with Supabase Auth (email one-time code).
--   * company_users maps each email to exactly one supplier company.
--   * Row level security lets a signed-in user read only their own company's rows.
--   * Sensitive fields (full bank number, phone, fraud flag, internal notes) live in
--     *_private tables with RLS on and NO policies: only the server's service role reads them.

drop table if exists policies, cases, payments, invoice_private, invoices, purchase_orders,
  company_users, company_private, companies cascade;
drop function if exists public.my_company_id();

create table companies (
  id text primary key,
  name text not null,
  payment_terms text not null,
  payment_method text not null,
  bank_name text not null,
  bank_last4 text not null
);

create table company_private (
  company_id text primary key references companies(id) on delete cascade,
  bank_account_number text not null,
  phone_on_file text not null,
  fraud_flag boolean not null default false,
  internal_notes text not null default ''
);

create table company_users (
  email text primary key check (email = lower(email)),
  company_id text not null references companies(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table purchase_orders (
  number text primary key,
  company_id text not null references companies(id) on delete cascade,
  buyer_name text not null,
  total_amount numeric not null,
  invoiced_to_date numeric not null,
  receipt_status text not null,
  lines jsonb not null default '[]'
);

create table invoices (
  number text primary key,
  company_id text not null references companies(id) on delete cascade,
  po_number text not null,
  amount numeric not null,
  invoice_date date not null,
  due_date date not null,
  status text not null,
  scheduled_payment_date date,
  payment_id text,
  hold_reason text,
  supplier_memo text
);

create table invoice_private (
  invoice_number text primary key references invoices(number) on delete cascade,
  internal_notes text not null
);

create table payments (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  invoice_numbers text[] not null,
  amount numeric not null,
  date date not null,
  method text not null,
  reference text not null,
  deductions jsonb not null default '[]'
);

-- Escalations, bank change requests and missing-invoice tickets the agent opens.
create table cases (
  id text primary key,
  company_id text references companies(id) on delete set null,
  type text not null,
  category text,
  summary text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- AP policies. company_id null = applies to all suppliers; set = that supplier's agreement.
-- audience 'internal' sections are for the AP team only.
create table policies (
  id text primary key,
  policy_id text not null,
  policy_title text not null,
  heading text not null,
  body text not null,
  audience text not null check (audience in ('supplier', 'internal')),
  company_id text references companies(id) on delete cascade
);

create index on invoices (company_id);
create index on purchase_orders (company_id);
create index on payments (company_id);
create index on company_users (company_id);

-- The signed-in user's company, from the email in their auth token.
create function public.my_company_id() returns text
language sql stable security definer set search_path = public as $$
  select company_id from company_users where email = lower(auth.jwt() ->> 'email')
$$;

alter table companies enable row level security;
alter table company_private enable row level security;
alter table company_users enable row level security;
alter table purchase_orders enable row level security;
alter table invoices enable row level security;
alter table invoice_private enable row level security;
alter table payments enable row level security;
alter table cases enable row level security;
alter table policies enable row level security;

create policy own_company on companies for select to authenticated using (id = public.my_company_id());
create policy own_membership on company_users for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));
create policy own_company on purchase_orders for select to authenticated using (company_id = public.my_company_id());
create policy own_company on invoices for select to authenticated using (company_id = public.my_company_id());
create policy own_company on payments for select to authenticated using (company_id = public.my_company_id());
-- Signed-in users see general supplier-facing policies plus their own supplier's agreement, never internal sections.
create policy visible_policies on policies for select to authenticated
  using (audience = 'supplier' and (company_id is null or company_id = public.my_company_id()));
-- company_private, invoice_private, cases: no policies = no access except the service role.
