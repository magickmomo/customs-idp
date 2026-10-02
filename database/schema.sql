create table if not exists document_packs (
  id text primary key,
  pack_uuid uuid not null default gen_random_uuid(),
  customer text not null,
  docs integer not null default 0,
  status text not null default 'Processing',
  confidence numeric not null default 0,
  received text,
  ticket text,
  assigned_to text not null default 'Unassigned',
  extracted_data jsonb,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists document_packs_pack_uuid_unique_idx on document_packs(pack_uuid);
create index if not exists document_packs_assigned_to_idx on document_packs(assigned_to);
create index if not exists document_packs_status_idx on document_packs(status);
create index if not exists document_packs_customer_idx on document_packs(customer);
