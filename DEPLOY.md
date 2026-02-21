# Cómo publicar los cambios

## 1. Supabase (migración + Edge Function)

Desde la raíz del proyecto, con [Supabase CLI](https://supabase.com/docs/guides/cli) instalado y el proyecto enlazado:

```bash
# Aplicar la migración (nueva columna pending_question_index en steve_conversations)
npx supabase db push
```

Si usas un proyecto remoto y prefieres solo migraciones:

```bash
npx supabase migration up
```

Luego desplegar la Edge Function que cambió (steve-chat):

```bash
npx supabase functions deploy steve-chat
```

Para desplegar todas las functions:

```bash
npx supabase functions deploy
```

---

## 2. Frontend (Lovable)

Según tu README:

- **Opción A:** Sube los cambios a GitHub. Si tienes auto-deploy (GitHub → Lovable), el frontend se publica solo.
- **Opción B:** En [Lovable](https://lovable.dev) abre el proyecto → **Share** → **Publish**.

---

## Resumen rápido (orden sugerido)

```bash
# 1. Migración en Supabase
npx supabase db push

# 2. Desplegar la función steve-chat
npx supabase functions deploy steve-chat

# 3. Frontend: commit + push (si usas auto-deploy)
git add .
git commit -m "fix: Steve rechazo + conversación fluida"
git push
```

Si no tienes el CLI de Supabase enlazado, en el dashboard de Supabase (SQL Editor) puedes ejecutar a mano:

```sql
ALTER TABLE public.steve_conversations
  ADD COLUMN IF NOT EXISTS pending_question_index integer;
```

Luego despliega la función desde el dashboard (Supabase → Edge Functions → steve-chat → Deploy) o con `supabase functions deploy steve-chat` cuando tengas el CLI configurado.
