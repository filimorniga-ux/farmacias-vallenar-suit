-- Migration 017: Add price_research_results table
-- Stores results from web price research sessions

CREATE TABLE IF NOT EXISTS price_research_results (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    product_id TEXT,
    product_name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    current_price NUMERIC(12,2) DEFAULT 0,
    market_price_min NUMERIC(12,2) DEFAULT 0,
    market_price_max NUMERIC(12,2) DEFAULT 0,
    market_price_avg NUMERIC(12,2) DEFAULT 0,
    sources JSONB DEFAULT '[]'::jsonb,
    price_diff_percent NUMERIC(8,2) DEFAULT 0,
    confidence TEXT DEFAULT 'LOW' CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'SKIPPED', 'ERROR')),
    researched_at TIMESTAMPTZ DEFAULT NOW(),
    applied_at TIMESTAMPTZ,
    applied_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_research_session ON price_research_results(session_id);
CREATE INDEX IF NOT EXISTS idx_price_research_sku ON price_research_results(sku);
CREATE INDEX IF NOT EXISTS idx_price_research_status ON price_research_results(status);
CREATE INDEX IF NOT EXISTS idx_price_research_date ON price_research_results(researched_at DESC);
