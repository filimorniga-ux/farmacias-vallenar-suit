-- Migrate Sales with no folio to RECIBO
BEGIN;

UPDATE sales 
SET dte_type = 'RECIBO' 
WHERE dte_type = 'BOLETA' AND dte_folio IS NULL;

COMMIT;
