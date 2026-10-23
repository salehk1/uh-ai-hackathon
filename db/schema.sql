-- Houston Price Receipt: one row per cleaned listing with its fair-price prediction.
-- label = verdict vs the calibrated 80% range: high (> q90), low (< q10), expected.
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
  q10_price     double precision,
  q90_price     double precision,
  residual_pct  double precision,
  label         text check (label in ('high', 'low', 'expected')),
  contributions jsonb,
  description   text,
  ppsf          double precision generated always as (price / nullif(living_area, 0)) stored
);
create index homes_zipcode_idx on homes (zipcode);
create index homes_label_idx on homes (label);
create index homes_price_idx on homes (price);
alter table homes enable row level security;  -- API uses the server-side DB connection only

-- Report-only evidence for every raw listing (including ones the price model excludes).
drop table if exists listing_details;
create table listing_details (
  zpid                         bigint primary key,
  street_address               text,
  city                         text,
  state                        text,
  zipcode                      text,
  lat                          double precision,
  lon                          double precision,
  home_type                    text,
  price                        double precision,
  living_area                  double precision,
  beds                         double precision,
  baths                        double precision,
  year_built                   double precision,
  lot_acres                    double precision,
  monthly_hoa                  double precision,   -- null = not disclosed (not $0)
  property_tax_rate            double precision,   -- percent
  days_on_zillow               double precision,
  page_views                   double precision,
  favorites                    double precision,
  home_status                  text,
  hdp_url                      text,
  date_posted                  text,
  scraped_at                   text,
  agent_name                   text,
  agent_license                text,
  agent_phone                  text,
  broker_name                  text,
  mls_name                     text,
  mls_id                       text,
  photo_count                  double precision,
  n_photo_ids                  integer,
  rate_30yr                    double precision,
  rate_15yr                    double precision,
  annual_insurance_zillow      double precision,
  is_undisclosed_address       boolean,
  has_bad_geocode              boolean,
  has_description              boolean,
  dup_photo_same_broker_n      integer,
  dup_photo_other_broker_n     integer,
  dup_photo_other_broker_zpids bigint[],
  dup_desc_same_broker_n       integer,
  dup_desc_other_broker_n      integer,
  dup_desc_other_broker_zpids  bigint[],
  engagement_z                 double precision
);
create index listing_details_addr_idx on listing_details (lower(street_address));
alter table listing_details enable row level security;
