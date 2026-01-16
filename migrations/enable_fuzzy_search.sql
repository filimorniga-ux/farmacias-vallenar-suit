-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on product names for fast fuzzy search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops);

-- Function to search products with similarity
CREATE OR REPLACE FUNCTION search_products_fuzzy(
    search_term TEXT,
    limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
    id TEXT,
    sku TEXT,
    name TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id::TEXT, 
        p.sku::TEXT, 
        p.name::TEXT, 
        similarity(p.name, search_term) as sim
    FROM products p
    WHERE 
        p.name % search_term  -- Operator % uses strict threshold (default 0.3)
        OR p.sku ILIKE '%' || search_term || '%'
    ORDER BY sim DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
