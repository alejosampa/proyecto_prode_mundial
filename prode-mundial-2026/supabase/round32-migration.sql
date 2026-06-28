alter table fixtures add column if not exists phase text not null default 'group';
alter table fixtures add column if not exists lock_at timestamptz;

update fixtures
set phase = 'group'
where phase is null or phase = '';

create index if not exists fixtures_phase_display_order_idx on fixtures (phase, display_order);

create table if not exists phase_submissions (
  participant_id text not null references participants(id) on delete cascade,
  phase text not null,
  submitted_at timestamptz not null default now(),
  primary key (participant_id, phase)
);

alter table phase_submissions enable row level security;
