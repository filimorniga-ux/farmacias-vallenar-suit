CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(255) NOT NULL,
    accion VARCHAR(50) NOT NULL,
    detalle TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_fecha ON audit_logs(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_accion ON audit_logs(accion);
