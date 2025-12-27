-- Actualizar PINs de todos los usuarios a 1213 para desarrollo
-- Limpia access_pin_hash para forzar uso de PIN en texto plano

UPDATE users 
SET access_pin = '1213', 
    access_pin_hash = NULL 
WHERE role IN ('CASHIER', 'QF', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL');

-- Verificar resultados
SELECT id, name, role, access_pin 
FROM users 
WHERE role IN ('CASHIER', 'QF', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL')
ORDER BY role, name;
