# Deploy con Supabase y Render

## 1. Base limpia

1. Entrar a https://supabase.com.
2. Abrir el proyecto `prode-mundial-2026`.
3. Ir a `SQL Editor`.
4. Copiar y ejecutar el contenido de `supabase/schema.sql`.
5. Ir a `Project Settings > API`.
6. Copiar:
   - `Project URL`
   - `service_role` key

La `service_role` key no va en el frontend. Solo se usa en el servidor y en Render.

## 2. Cargar dieciseisavos

En PowerShell, desde esta carpeta:

```powershell
$env:SUPABASE_URL="TU_PROJECT_URL"
$env:SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY"
npm.cmd run seed:supabase
```

La salida esperada es:

```text
Fixture cargado en Supabase: 16 partidos.
```

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

## 4. Deploy en Render

1. Subir estos cambios a GitHub.
2. Entrar a https://render.com.
3. Crear o abrir el Web Service.
4. Configurar:
   - Root Directory: `prode-mundial-2026`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
5. Agregar variables de entorno:
   - `ADMIN_KEY`
   - `ACTIVE_PHASE=round32`
   - `MATCH_LIMIT`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

Para probar con pocos partidos:

```text
MATCH_LIMIT=3
```

Para abrir todos los dieciseisavos, borrar `MATCH_LIMIT` o dejarlo vacio.

## Seguridad

`npm.cmd run reset:supabase` esta desactivado para evitar borrar participantes y predicciones por accidente.
