-- Limpiar planes legacy (Free/Starter/Pro/Agency que nunca se usaron)
DELETE FROM user_subscriptions;
DELETE FROM subscription_plans;

-- Insertar 3 nuevos planes: Visual, Estrategia, Full
INSERT INTO subscription_plans (id, name, slug, price_monthly, credits_monthly, features, is_active) VALUES
  (gen_random_uuid(), 'Visual',     'visual',     49990,  NULL, '{"tier": 1}', true),
  (gen_random_uuid(), 'Estrategia', 'estrategia', 99990,  NULL, '{"tier": 2}', true),
  (gen_random_uuid(), 'Full',       'full',       199990, NULL, '{"tier": 3}', true);

-- Asignar plan Visual a todos los clientes existentes que no tienen suscripción
INSERT INTO user_subscriptions (id, user_id, plan_id, status, credits_used, credits_reset_at)
SELECT DISTINCT ON (c.client_user_id) gen_random_uuid(), c.client_user_id, sp.id, 'active', 0, now()
FROM clients c
CROSS JOIN subscription_plans sp
WHERE sp.slug = 'visual'
  AND c.client_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_subscriptions us WHERE us.user_id = c.client_user_id);
