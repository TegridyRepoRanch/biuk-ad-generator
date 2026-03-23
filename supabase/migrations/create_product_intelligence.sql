CREATE TABLE IF NOT EXISTS product_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL,
  normalized_url text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  features jsonb DEFAULT '[]'::jsonb,
  target_surfaces jsonb DEFAULT '[]'::jsonb,
  problem_it_solves text,
  price_info text,
  scene_pool jsonb DEFAULT '[]'::jsonb,
  cached_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_intelligence_normalized_url ON product_intelligence(normalized_url);
CREATE INDEX IF NOT EXISTS idx_product_intelligence_category ON product_intelligence(category);
