CREATE TABLE IF NOT EXISTS sales_headers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id TEXT NOT NULL, -- 'SANTIAGO', 'COLCHAGUA'
    total_amount INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_items (
    id SERIAL PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES sales_headers(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    sku TEXT,
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    subtotal INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_headers_branch ON sales_headers(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_headers_created_at ON sales_headers(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_items_sale_id ON sales_items(sale_id);
