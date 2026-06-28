create table if not exists fixtures (
  id text primary key,
  phase text not null default 'group',
  group_name text not null,
  matchday integer not null,
  match_date timestamptz not null,
  lock_at timestamptz,
  venue text not null,
  home_team text not null,
  away_team text not null,
  display_order integer not null unique
);

create table if not exists participants (
  id text primary key,
  device_id text not null unique,
  full_name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists predictions (
  participant_id text not null references participants(id) on delete cascade,
  match_id text not null references fixtures(id) on delete cascade,
  home_goals integer not null check (home_goals >= 0 and home_goals <= 30),
  away_goals integer not null check (away_goals >= 0 and away_goals <= 30),
  primary key (participant_id, match_id)
);

create table if not exists results (
  match_id text primary key references fixtures(id) on delete cascade,
  home_goals integer not null check (home_goals >= 0 and home_goals <= 30),
  away_goals integer not null check (away_goals >= 0 and away_goals <= 30),
  updated_at timestamptz not null default now()
);

create table if not exists phase_submissions (
  participant_id text not null references participants(id) on delete cascade,
  phase text not null,
  submitted_at timestamptz not null default now(),
  primary key (participant_id, phase)
);

create index if not exists fixtures_phase_display_order_idx on fixtures (phase, display_order);

alter table fixtures enable row level security;
alter table participants enable row level security;
alter table predictions enable row level security;
alter table results enable row level security;
alter table phase_submissions enable row level security;
