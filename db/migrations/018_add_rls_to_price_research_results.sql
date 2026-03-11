-- 018_add_rls_to_price_research_results.sql
-- Habilita Row Level Security y crea políticas para price_research_results

-- 1. Enable RLS
ALTER TABLE price_research_results ENABLE ROW LEVEL SECURITY;

-- 2. Policy: service_role puede todo (usado por server actions)
CREATE POLICY "service_role_full_access"
ON price_research_results
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Policy: authenticated users pueden leer (para consultar historial)
CREATE POLICY "authenticated_read_access"
ON price_research_results
FOR SELECT
TO authenticated
USING (true);

-- 4. Policy: solo service_role puede insertar/actualizar (server actions)
-- (implícito: sin política INSERT/UPDATE para authenticated = denegado)
