-- ============================================================
-- FASE 6 B.1: agent_role — rol restringido para agentes IA
-- SELECT en todo, INSERT/UPDATE solo en tablas operativas,
-- REVOKE DELETE/TRUNCATE en todo.
-- ============================================================

-- Crear el rol si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_role') THEN
    CREATE ROLE agent_role NOLOGIN;
  END IF;
END
$$;

-- ── SELECT en todas las tablas públicas ──
GRANT USAGE ON SCHEMA public TO agent_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_role;

-- ── INSERT/UPDATE solo en tablas operativas de agentes ──
GRANT INSERT, UPDATE ON public.tasks TO agent_role;
GRANT INSERT, UPDATE ON public.qa_log TO agent_role;
GRANT INSERT, UPDATE ON public.criterio_results TO agent_role;
GRANT INSERT, UPDATE ON public.creative_history TO agent_role;

-- ── REVOKE DELETE/TRUNCATE en todo (defensa en profundidad) ──
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM agent_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE, TRUNCATE ON TABLES FROM agent_role;

-- ── Permitir uso de secuencias (para gen_random_uuid en INSERTs) ──
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO agent_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO agent_role;
