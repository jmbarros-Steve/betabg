# Skyvern — Integración con Steve Platform

## Acceso

| Recurso | URL |
|---------|-----|
| API | `http://localhost:8000` |
| UI | `http://localhost:8080` |
| Containers | `~/skyvern` (Docker Compose) |

## Autenticación

Todas las llamadas al API requieren el header `x-api-key`:

```
x-api-key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQ5MTg3NDcwNzQsInN1YiI6Im9fNTA3MjUyMjgwMjMwMTYzMDc4In0.77WUj9xpzCq2xKQv5WZK7_aRBVrhmCbhcibUUFDJaQE
```

## Crear una tarea

```bash
curl -X POST http://localhost:8000/v1/run/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: <TOKEN>" \
  -d '{
    "url": "https://ejemplo.com",
    "prompt": "Navega al login y completa el formulario con email test@test.com",
    "engine": "skyvern-2.0"
  }'
```

Respuesta:
```json
{
  "run_id": "tsk_v2_507255378383187738",
  "status": "queued",
  "app_url": "http://localhost:8080/runs/wr_..."
}
```

## Consultar estado

```bash
curl http://localhost:8000/v1/runs/<run_id> \
  -H "x-api-key: <TOKEN>"
```

Estados posibles: `queued` → `running` → `completed` | `failed`

## Conexión con Steve Tasks

Cuando se crea una task en la tabla `tasks` con `type = 'skyvern-onboarding'`, el cron
`/api/cron/skyvern-dispatcher` la detecta automáticamente y:

1. Lee el campo `spec` (JSONB) para obtener `url` y `prompt`
2. Crea un run en Skyvern via API
3. Actualiza la task a `in_progress` con el `run_id` en `result`
4. En la siguiente ejecución, consulta el estado del run y marca la task como `completed` o `failed`

### Ejemplo: crear task de onboarding

```sql
INSERT INTO tasks (shop_id, title, description, type, source, priority, spec)
VALUES (
  'uuid-del-cliente',
  'Onboarding automático: configurar Shopify',
  'Navegar a Shopify admin y configurar checkout settings',
  'skyvern-onboarding',
  'cerebro',
  'alta',
  '{"url": "https://admin.shopify.com/store/mi-tienda", "prompt": "Navigate to Settings > Checkout and enable automatic email collection"}'
);
```

## LLM Config

- Provider: Anthropic (`ANTHROPIC_CLAUDE4_SONNET`)
- Modelo: `claude-sonnet-4-20250514`
- Config: `~/skyvern/.env` con `ENABLE_ANTHROPIC=true`

## Operaciones

```bash
# Reiniciar
cd ~/skyvern && sudo docker compose restart skyvern

# Ver logs
cd ~/skyvern && sudo docker logs -f skyvern-skyvern-1

# Parar todo
cd ~/skyvern && sudo docker compose down

# Iniciar todo
cd ~/skyvern && sudo docker compose up -d
```
