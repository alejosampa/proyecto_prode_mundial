# Deploy con Supabase y Render

## 1. Crear Supabase

1. Entrar a https://supabase.com y crear cuenta.
2. Crear un proyecto nuevo llamado `prode-mundial-2026`.
3. Ir a `SQL Editor`.
4. Copiar y ejecutar el contenido de `supabase/schema.sql`.
5. Ir a `Project Settings > API`.
6. Copiar:
   - `Project URL`
   - `service_role` key

La `service_role` key no va en el frontend. Solo se usa en el servidor y en Render.

## 2. Cargar el fixture

En PowerShell, desde esta carpeta:

```powershell
$env:SUPABASE_URL="TU_PROJECT_URL"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
npm.cmd run seed:supabase
```

Deberia decir que cargo el fixture completo disponible.

## Actualizar a dieciseisavos

Si la base ya existe con la fase de grupos, no ejecutes `schema.sql` de nuevo ni borres tablas.

1. Entrar a Supabase > `SQL Editor`.
2. Copiar y ejecutar el contenido de `supabase/round32-migration.sql`.
3. En PowerShell, desde esta carpeta, cargar el nuevo fixture:

```powershell
$env:SUPABASE_URL="TU_PROJECT_URL"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
npm.cmd run seed:supabase
```

Esto conserva participantes, predicciones y resultados de fase de grupos, y agrega dieciseisavos.

## 3. Probar local contra Supabase

```powershell
$env:ADMIN_KEY="admin-2026"
$env:SUPABASE_URL="TU_PROJECT_URL"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
npm.cmd run dev
```

Abrir:

```text
http://localhost:3000
http://localhost:3000/admin?key=admin-2026
```

En el admin deberia aparecer `supabase` junto al conteo de participantes.

## 4. Deploy en Render

1. Subir estos cambios a GitHub.
2. Entrar a https://render.com.
3. Crear `New Web Service`.
4. Conectar el repo `alejosampa/proyecto_prode_mundial`.
5. Configurar:
   - Root Directory: `prode-mundial-2026`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
6. Agregar variables de entorno:
   - `ADMIN_KEY`
   - `ACTIVE_PHASE=round32`
   - `MATCH_LIMIT`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

El link final de Render va a ser el que compartas con los participantes.

## Modo prueba con pocos partidos

Para probar con usuarios reales sin abrir todos los dieciseisavos, agregar en Render:

```text
MATCH_LIMIT=3
```

Con eso la app muestra, exige y calcula puntos solo sobre los primeros 3 partidos de la etapa activa.

Para volver a todos los dieciseisavos:

1. Borrar la variable `MATCH_LIMIT` en Render, o dejarla vacia.
2. Si queres borrar solo datos de prueba de dieciseisavos, sin tocar grupos ni participantes:
   ```powershell
   $env:SUPABASE_URL="TU_PROJECT_URL"
   $env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
   npm.cmd run reset:round32
   ```
3. Redeploy/restart del servicio en Render.
