-- =================================================================
-- Chocxo Amazon KPIs — Supabase schema
-- Run this entire file in Supabase SQL Editor on first deploy.
-- =================================================================

-- =================================================================
-- TABLES
-- =================================================================

create table if not exists catalog (
  asin text primary key,
  internal_sku text not null,
  product_name text not null,
  brand text not null,
  category text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sellerboard_data (
  id bigserial primary key,
  month text not null,
  year int not null default 2026,
  brand text not null,
  asin text not null,
  sessions int default 0,
  units int default 0,
  gross_sales numeric(12,2) default 0,
  refunds numeric(12,2) default 0,
  created_at timestamptz default now(),
  unique (asin, month, year)
);

create index if not exists sb_month_brand_idx on sellerboard_data (month, year, brand);
create index if not exists sb_asin_idx on sellerboard_data (asin);

create table if not exists ppc_data (
  id bigserial primary key,
  month text not null,
  year int not null default 2026,
  brand text not null,
  campaign text not null,
  ad_type text,
  impressions int default 0,
  clicks int default 0,
  spend numeric(12,2) default 0,
  sales numeric(12,2) default 0,
  orders int default 0,
  created_at timestamptz default now(),
  unique (campaign, month, year)
);

create index if not exists ppc_month_brand_idx on ppc_data (month, year, brand);

-- =================================================================
-- RLS — public read, authenticated write
-- =================================================================

alter table catalog enable row level security;
alter table sellerboard_data enable row level security;
alter table ppc_data enable row level security;

create policy "public read catalog"        on catalog          for select using (true);
create policy "public read sellerboard"    on sellerboard_data for select using (true);
create policy "public read ppc"            on ppc_data         for select using (true);

create policy "auth write catalog"         on catalog          for all to authenticated using (true) with check (true);
create policy "auth write sellerboard"     on sellerboard_data for all to authenticated using (true) with check (true);
create policy "auth write ppc"             on ppc_data         for all to authenticated using (true) with check (true);

-- =================================================================
-- SEED — Catalog (10 Chocxo SKUs)
-- =================================================================

INSERT INTO catalog (asin, internal_sku, product_name, brand, category) VALUES
  ('B0DL3SG7Y5', '900969-CS6', 'Chocxo Lemon Creme Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0DL4Z8V6C', '900959-CS6', 'Chocxo Peppermint Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0C3MHK4RY', '900950-CS6', 'Chocxo Coconut Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0CNDCG7KR', '900900-CS6', 'Chocxo Coconut Almond Sea Salt Snaps - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0G2MTNRGV', '900978-CS6', 'Chocxo Coconut Cookie Caramel Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0DL3QCJ98', '900975-CS6', 'Chocxo Cookies & Creme Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0CK82FBGV', '900143-CS6', 'Chocxo Almond Butter Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0CK841LMJ', '900921-CS6', 'Chocxo Peanut Butter Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0CK83BW86', '900954-CS6', 'Chocxo Toffee Almond Sea Salt Snaps - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate'),
  ('B0GGVGPXXC', '900976-CS6', 'Chocxo Dubai-Style Pistachio Cups - 98 g (Pack of 6)', 'Chocxo', 'Retail Chocolate')
ON CONFLICT (asin) DO NOTHING;

-- =================================================================
-- SEED — Sellerboard data (Jan, Feb, March 2026)
-- =================================================================
INSERT INTO sellerboard_data (month, year, brand, asin, sessions, units, gross_sales, refunds) VALUES
  ('January', 2026, 'Chocxo', 'B0DL3SG7Y5', 1866, 96, 3324.19, -40.67),
  ('January', 2026, 'Chocxo', 'B0DL4Z8V6C', 931, 88, 4135.12, -145.69),
  ('January', 2026, 'Chocxo', 'B0C3MHK4RY', 704, 77, 3546.83, -122.01),
  ('January', 2026, 'Chocxo', 'B0CNDCG7KR', 1425, 67, 2916.05, -23.68),
  ('January', 2026, 'Chocxo', 'B0G2MTNRGV', 445, 34, 1597.66, -244.02),
  ('January', 2026, 'Chocxo', 'B0DL3QCJ98', 700, 32, 1516.68, -122.01),
  ('January', 2026, 'Chocxo', 'B0CK82FBGV', 353, 16, 751.84, -81.34),
  ('January', 2026, 'Chocxo', 'B0CK841LMJ', 218, 14, 657.86, 0),
  ('January', 2026, 'Chocxo', 'B0CK83BW86', 292, 13, 613.87, 0),
  ('January', 2026, 'Chocxo', 'B0GGVGPXXC', 25, 0, 0, 0),
  ('February', 2026, 'Chocxo', 'B0CNDCG7KR', 2380, 172, 7181.40, -36.32),
  ('February', 2026, 'Chocxo', 'B0C3MHK4RY', 1266, 139, 6305.66, -157.44),
  ('February', 2026, 'Chocxo', 'B0GGVGPXXC', 2093, 121, 5708.79, -81.34),
  ('February', 2026, 'Chocxo', 'B0DL3SG7Y5', 1010, 88, 3083.84, -89.24),
  ('February', 2026, 'Chocxo', 'B0G2MTNRGV', 563, 31, 1456.69, -122.01),
  ('February', 2026, 'Chocxo', 'B0DL3QCJ98', 546, 20, 956.84, -83.08),
  ('February', 2026, 'Chocxo', 'B0CK82FBGV', 322, 16, 751.84, -40.67),
  ('February', 2026, 'Chocxo', 'B0CK83BW86', 345, 16, 767.84, 0),
  ('February', 2026, 'Chocxo', 'B0CK841LMJ', 255, 16, 751.84, 0),
  ('February', 2026, 'Chocxo', 'B0DL4Z8V6C', 618, 0, 0, -40.67),
  ('March', 2026, 'Chocxo', 'B0GGVGPXXC', 4706, 312, 14493.88, -292.25),
  ('March', 2026, 'Chocxo', 'B0C3MHK4RY', 1390, 182, 7582.46, -34.61),
  ('March', 2026, 'Chocxo', 'B0CK841LMJ', 955, 84, 2757.16, 0),
  ('March', 2026, 'Chocxo', 'B0CK83BW86', 927, 82, 2693.18, 0),
  ('March', 2026, 'Chocxo', 'B0CNDCG7KR', 1040, 77, 3187.99, -35.45),
  ('March', 2026, 'Chocxo', 'B0CK82FBGV', 933, 51, 1750.49, 0),
  ('March', 2026, 'Chocxo', 'B0G2MTNRGV', 659, 33, 1552.67, -122.01);

-- =================================================================
-- SEED — PPC data (Jan, Feb, March 2026)
-- =================================================================
INSERT INTO ppc_data (month, year, brand, campaign, ad_type, impressions, clicks, spend, sales, orders) VALUES
  ('January', 2026, 'Chocxo', 'Chocxo - SB - KWs - Branded KWs - Exact', 'SB2', 22187, 837, 633.83, 8366.50, 297),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - High interest', 'SP', 54927, 367, 516, 1225.65, 27),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - Clicked or added to cart', 'SP', 29033, 277, 372.30, 1109.89, 24),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - KWs - Exact', 'SP', 45745, 136, 220.69, 308.51, 7),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - 1 KW - ''chocxo'' - Phrase', 'SP', 13931, 195, 212.48, 473.39, 11),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - Purchased brand''s product', 'SP', 25539, 109, 102.60, 597.27, 13),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - Category', 'SP', 48536, 145, 100.76, 212.43, 5),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - PPC - KWs - Exact', 'SP', 8284, 105, 58.86, 845.82, 18),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - KWs - Broad', 'SP', 16635, 48, 51.95, 128.85, 3),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - KWs - Phrase', 'SP', 4413, 21, 25.16, 0, 0),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - ASINs', 'SP', 3129, 13, 15.30, 0, 0),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - CC - Branded KWs - Exact', 'SP', 837, 8, 6.34, 93.98, 2),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - Auto', 'SP', 1859, 8, 5.20, 42.95, 1),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - CASS - Branded KWs - Exact', 'SP', 542, 2, 2.65, 0, 0),
  ('January', 2026, 'Chocxo', 'Chocxo - SP - 1 KW - ''dark chocolate'' - Exact - Ranking', 'SP', 1, 0, 0, 0, 0),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - High interest', 'SP', 128902, 692, 1399.83, 1805.63, 41),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - Clicked or added to cart', 'SP', 36165, 300, 502.85, 814.12, 19),
  ('February', 2026, 'Chocxo', 'Chocxo - SB - KWs - Branded KWs - Exact', 'SB2', 25910, 547, 454.59, 4892.59, 194),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - Category', 'SP', 142978, 503, 369.90, 1481.75, 33),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - 1 KW - ''chocxo'' - Phrase', 'SP', 24392, 220, 267.15, 1146.46, 26),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - KWs - Exact', 'SP', 15088, 71, 153.18, 214.79, 4),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - KWs - Broad', 'SP', 28036, 108, 114.98, 179.88, 4),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - CASS - Branded KWs - Exact', 'SP', 7012, 134, 111.33, 836.15, 18),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - Purchased brand''s product', 'SP', 9745, 68, 74.22, 691.09, 16),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - KWs - Phrase', 'SP', 6854, 25, 24.44, 41.95, 1),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - CC - Branded KWs - Exact', 'SP', 1889, 21, 18.53, 182.50, 4),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - Auto', 'SP', 5577, 17, 9.37, 0, 0),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - 1 KW - ''dark chocolate'' - Exact - Ranking', 'SP', 0, 0, 0, 0, 0),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - ASINs', 'SP', 6, 0, 0, 0, 0),
  ('February', 2026, 'Chocxo', 'Chocxo - SP - PPC - KWs - Exact', 'SP', 0, 0, 0, 0, 0),
  ('March', 2026, 'Chocxo', 'Dubai Chocolate - SP - Auto', 'SP', 52432, 1205, 713.80, 4571.11, 96),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto - B0CK841LMJ', 'SP', 69511, 478, 612.35, 1168.59, 35),
  ('March', 2026, 'Chocxo', 'Chocxo - SB - KWs - Branded KWs - Exact', 'SB2', 23817, 590, 459.69, 4965.51, 192),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto - B0CK82FBGV', 'SP', 65821, 330, 432.04, 359.88, 12),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto - B0CK83BW86', 'SP', 43021, 307, 342.06, 776.75, 24),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - Clicked or added to cart', 'SP', 7307, 185, 268.73, 996.80, 24),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - Purchased brand''s product', 'SP', 17455, 150, 211.16, 925.31, 22),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto - Audiences - High interest', 'SP', 18661, 118, 174.88, 450.61, 10),
  ('March', 2026, 'Chocxo', 'Dubai Chocolate - SP - Auto - AMC - Add to cart - TOS 900', 'SP', 19393, 241, 174.16, 611.87, 13),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - CASS - Branded KWs - Exact', 'SP', 7591, 161, 154.97, 1133.47, 29),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - CC - Branded KWs - Exact', 'SP', 5342, 58, 51.35, 356.91, 9),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - KWs - Exact', 'SP', 4223, 17, 32.99, 0, 0),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - KWs - Broad', 'SP', 1390, 6, 3.61, 39.99, 1),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - KWs - Phrase', 'SP', 945, 4, 3.35, 0, 0),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - Auto', 'SP', 930, 3, 2.02, 0, 0),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - PPC - KWs - Exact', 'SP', 191, 2, 1.31, 0, 0),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - 1 KW - ''dark chocolate'' - Exact - Ranking', 'SP', 0, 0, 0, 0, 0),
  ('March', 2026, 'Chocxo', 'Chocxo - SP - ASINs', 'SP', 7, 0, 0, 0, 0);