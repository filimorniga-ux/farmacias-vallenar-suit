-- Re-create tables to match strict requirements
DROP TABLE IF EXISTS sales_items;
DROP TABLE IF EXISTS sales_headers;

CREATE TABLE sales_headers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_source VARCHAR NOT NULL, -- 'SANTIAGO' or 'COLCHAGUA'
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sales_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales_headers(id) ON DELETE CASCADE,
    product_name VARCHAR NOT NULL,
    sku VARCHAR,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL
);

CREATE INDEX idx_sales_headers_branch ON sales_headers(branch_source);
CREATE INDEX idx_sales_headers_created_at ON sales_headers(created_at);
CREATE INDEX idx_sales_items_sale_id ON sales_items(sale_id);
