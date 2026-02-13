

## Problema identificado

El error `invalid_client` ocurre porque hay una inconsistencia entre el frontend y el backend:

- **Frontend** (ya actualizado): usa Client ID `850416724643-52bpu0tvsd9juc2v5b636ajfk4sogt24.apps.googleusercontent.com`
- **Backend** (desactualizado): el secret `GOOGLE_CLIENT_ID` probablemente sigue con el valor anterior `870555860271-...`

Cuando Google recibe el codigo de autorizacion, el backend envia el Client ID viejo junto con el Client Secret del nuevo proyecto, y Google los rechaza porque no coinciden.

## Solucion

1. **Actualizar el secret `GOOGLE_CLIENT_ID`** en el backend al valor correcto: `850416724643-52bpu0tvsd9juc2v5b636ajfk4sogt24.apps.googleusercontent.com`

2. **Verificar el `GOOGLE_ADS_CLIENT_SECRET`** -- asegurarnos de que corresponde al mismo Client ID `850416724643-...`

3. **Redesplegar** la funcion `google-ads-oauth-callback` para que tome los secrets actualizados

4. **Probar** la conexion de Google Ads desde el portal

## Detalles tecnicos

El archivo `supabase/functions/google-ads-oauth-callback/index.ts` linea 78 lee:
```
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
```

Este secret necesita coincidir exactamente con el Client ID usado en el frontend (`ClientPortalConnections.tsx`) para que el flujo OAuth funcione correctamente.

