-- Houston Price Receipt: one row per cleaned listing with its fair-price prediction.
drop table if exists homes;
create table homes (
  zpid          bigint primary key,
  lat           double precision not null,
  lon           double precision not null,
  zipcode       text,
  home_type     text,
  price         double precision,
  living_area   double precision,
  beds          double precision,
  baths         double precision,
  year_built    double precision,
  school_mean   double precision,
  pred_price    double precision,
  residual_pct  double precision,
  label         text check (label in ('overpriced', 'underpriced', 'fair')),
  contributions jsonb,
  description   text,
  ppsf          double precision generated always as (price / nullif(living_area, 0)) stored
);
create index homes_zipcode_idx on homes (zipcode);
create index homes_label_idx on homes (label);
create index homes_price_idx on homes (price);
alter table homes enable row level security;  -- API uses the server-side DB connection only
