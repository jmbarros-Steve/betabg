-- Add Martín W20 (Landing & Conversión) to agent_sessions
INSERT INTO agent_sessions (agent_code, agent_name, squad, module)
VALUES ('w20', 'Martín', 'producto', 'Landing & Conversión')
ON CONFLICT (agent_code) DO NOTHING;
