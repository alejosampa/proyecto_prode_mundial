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

Deberia decir que cargo 72 partidos.

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
   - Root Directory: `tengo-que-hacer-una-aplicacion-para`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
6. Agregar variables de entorno:
   - `ADMIN_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

El link final de Render va a ser el que compartas con los participantes.
