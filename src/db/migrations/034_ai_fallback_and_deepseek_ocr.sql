BEGIN;

-- Add optional keys for secondary provider credentials and DeepSeek OCR endpoint.
INSERT INTO system_configs (config_key, config_type, category, description, allowed_values)
VALUES
('AI_FALLBACK_API_KEY', 'ENCRYPTED', 'AI', 'API Key del proveedor alternativo de IA (encriptada)', NULL),
('AI_DEEPSEEK_OCR_ENDPOINT', 'STRING', 'AI', 'Endpoint HTTP del OCR DeepSeek/self-hosted', NULL)
ON CONFLICT (config_key) DO NOTHING;

-- Expand provider options for modern OCR routing.
UPDATE system_configs
SET allowed_values = ARRAY['OPENAI', 'GEMINI', 'ANTHROPIC', 'DEEPSEEK_OCR']
WHERE config_key = 'AI_PROVIDER';

UPDATE system_configs
SET allowed_values = ARRAY['OPENAI', 'GEMINI', 'DEEPSEEK_OCR', 'NONE']
WHERE config_key = 'AI_FALLBACK_PROVIDER';

INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('034', 'ai_fallback_and_deepseek_ocr', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
