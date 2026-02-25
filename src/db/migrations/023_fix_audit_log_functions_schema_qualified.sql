-- Migration 023
-- Corrige funciones de auditoría endurecidas con search_path=''
-- para que usen referencias explícitas a tablas del schema public.
-- Evita errores 42P01: relation "audit_log" does not exist.

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_log_calculate_checksum()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    last_checksum VARCHAR(64);
    record_data TEXT;
BEGIN
    -- Con search_path vacío, siempre calificar el schema.
    SELECT checksum INTO last_checksum
    FROM public.audit_log
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    NEW.previous_checksum := COALESCE(last_checksum, 'GENESIS_BLOCK');

    record_data := concat_ws('|',
        NEW.id::text,
        NEW.created_at::text,
        COALESCE(NEW.user_id::text, 'NULL'),
        NEW.action_code,
        NEW.entity_type,
        COALESCE(NEW.entity_id, 'NULL'),
        COALESCE(NEW.old_values::text, 'NULL'),
        COALESCE(NEW.new_values::text, 'NULL'),
        NEW.previous_checksum
    );

    NEW.checksum := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(record_data, 'UTF8')), 'hex');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_audit_log(
    p_user_id UUID,
    p_user_name VARCHAR(255),
    p_user_role VARCHAR(50),
    p_session_id UUID,
    p_terminal_id UUID,
    p_location_id UUID,
    p_action_code VARCHAR(50),
    p_entity_type VARCHAR(50),
    p_entity_id VARCHAR(255),
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_justification TEXT DEFAULT NULL,
    p_authorized_by UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_audit_id UUID;
    v_requires_justification BOOLEAN;
BEGIN
    SELECT requires_justification INTO v_requires_justification
    FROM public.audit_action_catalog
    WHERE code = p_action_code;

    IF v_requires_justification AND (p_justification IS NULL OR LENGTH(TRIM(p_justification)) < 10) THEN
        RAISE EXCEPTION 'La acción % requiere justificación de al menos 10 caracteres', p_action_code;
    END IF;

    INSERT INTO public.audit_log (
        user_id, user_name, user_role,
        session_id, terminal_id, location_id,
        action_code, entity_type, entity_id,
        old_values, new_values, metadata,
        justification, authorized_by,
        ip_address, user_agent, request_id
    ) VALUES (
        p_user_id, p_user_name, p_user_role,
        p_session_id, p_terminal_id, p_location_id,
        p_action_code, p_entity_type, p_entity_id,
        p_old_values, p_new_values, p_metadata,
        p_justification, p_authorized_by,
        p_ip_address, p_user_agent, p_request_id
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

COMMIT;
