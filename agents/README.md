# Sistema de Agentes Steve — Guía Operativa

## Cómo funciona
Cada agente es un archivo de estado en `agents/state/`. No necesitas tmux ni ventanas paralelas.

### Activar un agente
Dile a Claude Code:
```
activa a Diego
```
Claude lee `agents/state/diego-w8.md`, sabe dónde quedó, y continúa.

### Al terminar la sesión
Claude actualiza automáticamente el archivo de estado del agente con:
- Qué se hizo
- Qué queda pendiente
- Blockers encontrados
- Fecha de última sesión

### Ver estado de todos los agentes
```
estado del equipo
```

## Fases de Activación

### FASE 1 — Plomería (activar primero)
| Agente | Archivo | Misión |
|--------|---------|--------|
| Diego W8 | `diego-w8.md` | DB: fuentes, triggers, verificar crons |
| Felipe W2 | `felipe-w2.md` | Meta Ads: conectar 1 cliente, verificar sync |
| Rodrigo W0 | `rodrigo-w0.md` | Klaviyo: conectar 1 cliente, verificar sync |
| Sebastián W5 | `sebastian-w5.md` | Infra: health-check 45 crons, env vars |

### FASE 2 — Inteligencia (después de Fase 1)
| Agente | Archivo | Misión |
|--------|---------|--------|
| Tomás W7 | `tomas-w7.md` | Cerebro: swarm, knowledge, approval flow |
| Isidora W6 | `isidora-w6.md` | Criterio: validar 493 reglas contra data real |
| Camila W4 | `camila-w4.md` | Frontend: portal cliente funcional |

### FASE 3 — Autonomía (cuando Fase 2 esté sólida)
| Agente | Archivo | Misión |
|--------|---------|--------|
| Leonardo W9 | `leonardo-w9.md` | Orquestador: agent-loop autónomo |
| Javiera W12 | `javiera-w12.md` | QA permanente |
| Paula W19 | `paula-w19.md` | Steve AI features |
| Nicolás W15 | `nicolas-w15.md` | Espejo: QA visual |

## Regla de oro
NO activar agentes de Fase 2 hasta que Fase 1 tenga un cliente con datos fluyendo.
NO activar agentes de Fase 3 hasta que Fase 2 tenga insights generándose.
