-- ============================================================
--  DBL REPUESTOS — Supabase Schema
--  Ejecutar en Supabase SQL Editor (Database → SQL Editor)
-- ============================================================

-- ── PRODUCTOS ────────────────────────────────────────────────
CREATE TABLE products (
  id              BIGSERIAL PRIMARY KEY,
  sku             TEXT UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  category        TEXT DEFAULT '',
  brand_compat    TEXT DEFAULT '',        -- ej: "Honda Wave, Yamaha Crypton"
  cost_price      NUMERIC(12,2) DEFAULT 0,
  sale_price      NUMERIC(12,2) DEFAULT 0,
  stock_qty       INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER NOT NULL DEFAULT 2,
  ml_item_id      TEXT UNIQUE,            -- ID de la publicación en Mercado Libre (ej MLA123456789)
  ml_status       TEXT NOT NULL DEFAULT 'not_listed' CHECK (ml_status IN ('not_listed','active','paused','closed')),
  ml_permalink    TEXT,                   -- link público a la publicación
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_photos (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── MOVIMIENTOS DE STOCK ─────────────────────────────────────
CREATE TABLE stock_movements (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('in','out','adjustment')),
  qty             INTEGER NOT NULL,
  reason          TEXT DEFAULT '',
  related_sale_id BIGINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── VENTAS ───────────────────────────────────────────────────
CREATE TABLE sales (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('mercadolibre','manual')),
  ml_order_id  TEXT UNIQUE,
  status       TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('pending','paid','shipped','delivered','cancelled')),
  buyer_name   TEXT DEFAULT '',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ml_fee       NUMERIC(12,2) DEFAULT 0,
  shipping_cost NUMERIC(12,2) DEFAULT 0,
  net_amount   NUMERIC(12,2) DEFAULT 0,
  sale_date    DATE DEFAULT CURRENT_DATE,
  notes        TEXT DEFAULT '',
  ml_shipment_id  TEXT,
  shipping_status TEXT,
  tracking_number TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_sale_fk
  FOREIGN KEY (related_sale_id) REFERENCES sales(id) ON DELETE SET NULL;

CREATE TABLE sale_items (
  id         BIGSERIAL PRIMARY KEY,
  sale_id    BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- ── CONTABILIDAD ─────────────────────────────────────────────
CREATE TABLE accounting_entries (
  id               BIGSERIAL PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('income','expense')),
  category         TEXT NOT NULL DEFAULT 'otros',
  amount           NUMERIC(12,2) NOT NULL,
  description      TEXT DEFAULT '',
  related_sale_id  BIGINT REFERENCES sales(id) ON DELETE SET NULL,
  entry_date       DATE DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── MERCADO LIBRE — credenciales (solo service role) ─────────
CREATE TABLE ml_credentials (
  id            BIGSERIAL PRIMARY KEY,
  ml_user_id    TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── MERCADO LIBRE — métricas diarias por producto ────────────
CREATE TABLE ml_item_metrics (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visits     INTEGER DEFAULT 0,
  questions  INTEGER DEFAULT 0,
  sales      INTEGER DEFAULT 0,
  UNIQUE (product_id, metric_date)
);

-- ── CONFIGURACIÓN ────────────────────────────────────────────
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('business_name', 'DBL Repuestos'),
  ('default_min_stock_alert', '2');

-- ============================================================
--  STORAGE — bucket para fotos de productos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-photos');

CREATE POLICY "product_photos_auth_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "product_photos_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-photos');

CREATE POLICY "product_photos_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-photos');

-- ============================================================
--  ROW LEVEL SECURITY
--  Este es un panel interno de un solo negocio: cualquier
--  usuario autenticado de Supabase Auth (el dueño / empleados
--  con cuenta) puede leer y escribir. ml_credentials queda
--  bloqueada del todo: solo la accede el backend con la
--  service_role key (funciones /api), nunca el cliente.
-- ============================================================

ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_item_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_credentials      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_products"           ON products           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_product_photos"     ON product_photos     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_stock_movements"    ON stock_movements    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_sales"              ON sales              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_sale_items"         ON sale_items         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_accounting_entries" ON accounting_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_ml_item_metrics"    ON ml_item_metrics    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_settings"           ON settings           FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ml_credentials: sin políticas para authenticated/anon → solo service_role (que bypassea RLS) puede tocarla.

-- ============================================================
--  Vista de alertas de stock bajo
-- ============================================================
CREATE OR REPLACE VIEW low_stock_products AS
  SELECT * FROM products
  WHERE active = true AND stock_qty <= min_stock_alert;
