-- Optimization indexes for Sales Reports and Financial Dashboards

-- 1. Indexes for STOCK_MOVEMENTS
-- Used in: getLogisticsKPIsSecure, getStockMovementsDetailSecure
-- Common filters: timestamp (range), location_id, movement_type

CREATE INDEX IF NOT EXISTS idx_stock_movements_loc_ts 
ON stock_movements (location_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_ts 
ON stock_movements (movement_type, timestamp DESC);

-- Composite index for specific filtered queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_composite 
ON stock_movements (location_id, movement_type, timestamp DESC);


-- 2. Indexes for CASH_MOVEMENTS
-- Used in: getCashFlowLedgerSecure, getDetailedFinancialSummarySecure
-- Common filters: timestamp (range), location_id, type (OPENING, CLOSING, etc)

CREATE INDEX IF NOT EXISTS idx_cash_movements_loc_ts 
ON cash_movements (location_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_cash_movements_type_ts 
ON cash_movements (type, timestamp DESC);

-- Reason is used for categorization in getDetailedFinancialSummarySecure but it is text (LIKE query)
-- We might consider a reason index but standard btree won't help much with '%LIKE%' unless prefix.
-- Given 'PAYROLL' etc are specialized, maybe a future improvement if needed.
