import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import type { Agent } from './agent-map.js';

const execAsync = promisify(exec);

export async function dispatchToAgent(agent: Agent, task: any, spec: string) {
  await mkdir('/home/jmbarros/steve/prompts/active', { recursive: true });

  const promptFile = `/home/jmbarros/steve/prompts/active/task-${task.id}.md`;
  const prompt = `# TAREA ${task.id}
Prioridad: ${task.priority} | Fuente: ${task.source} | Squad: ${task.assigned_squad}

## PROBLEMA
${task.title}

## DESCRIPCIÓN
${task.description}

## SPEC
${spec}

## REGLAS
- Arregla SOLO lo que dice la spec
- Corre tests de verificación al terminar
- git commit con mensaje "fix: ${task.title.substring(0, 60)}"
- Si no funciona en 30 min → para y reporta
- NUNCA hagas DELETE o DROP en la base de datos
`;

  await writeFile(promptFile, prompt);
  await execAsync(`tmux send-keys -t "steve:${agent.tmux_window}" "cat ${promptFile}" Enter`);
  return { dispatched: true, agent: agent.name, window: agent.tmux_window };
}
