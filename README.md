# Sala de Ventas · Lotes La Unión, Antioquia

Aplicación web para controlar lotes, propietarios y compromisos de pago.
Hecha con **Next.js** (pantallas y servidor), **Supabase** (base de datos y usuarios)
y pensada para publicarse en **Vercel**.

---

## Puesta en marcha (una sola vez, ~20 minutos)

### 1. Supabase: crear el proyecto y la base de datos
1. Entra a <https://supabase.com> → **New project**. Región sugerida: *East US (North Virginia)* o *São Paulo*.
2. Cuando termine de crearse: **SQL Editor → New query**, pega todo el contenido de
   `supabase/schema.sql` y presiona **Run**. (Se puede volver a correr sin perder datos.)
3. **Authentication → Sign In / Providers → Email**:
   - Desactiva **"Allow new users to sign up"** (solo los editores crean cuentas desde la app).
   - Puedes desactivar **"Confirm email"**.
4. **Authentication → Users → Add user → Create new user**: crea TU usuario (correo + contraseña,
   marca *Auto Confirm User*).
5. Vuelve al **SQL Editor** y conviértete en editor (cambia el correo):
   ```sql
   update public.perfiles set rol = 'editor' where email = 'tu-correo@ejemplo.com';
   ```
6. **Project Settings → API**: copia estos tres valores (los necesitas en el paso 2):
   - *Project URL* → `NEXT_PUBLIC_SUPABASE_URL`
   - *anon public* key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - *service_role* key (secreta) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Vercel: publicar
1. Sube esta carpeta a un repositorio de GitHub (privado está bien).
2. En <https://vercel.com> → **Add New → Project** → importa el repositorio.
3. En **Environment Variables** agrega las tres variables del paso 1.6.
4. **Deploy**. Vercel te da una dirección tipo `https://sala-ventas-xxxx.vercel.app`.
5. En Supabase → **Authentication → URL Configuration** pon esa dirección como *Site URL*.

### 3. Crear las cuentas del equipo
Entra a la app con tu usuario → **👥 Usuarios → + Nuevo usuario**. Escoge el rol:
- **Editor**: crea, edita y elimina todo (lotes, información, pagos, importar Excel, usuarios).
- **Visor**: solo consulta y exporta a Excel; no ve ningún botón de edición.

La seguridad no depende solo de esconder botones: la base de datos rechaza cualquier
cambio que no venga de un editor.

---

## Trabajar en tu computador (opcional)
```bash
npm install
cp .env.example .env.local   # y llena los valores
npm run dev                  # abre http://localhost:3000
npm test                     # pruebas de las reglas de negocio
```

## Estructura
| Archivo | Qué contiene |
|---|---|
| `supabase/schema.sql` | Tablas, roles, reglas de seguridad y funciones de importar/reemplazar plan |
| `lib/logic.ts` | Reglas de negocio: estado de cada pago, resumen general, generación del plan |
| `lib/excel.ts` | Exportar / importar Excel (hojas "Lotes", "Compromisos de pago" y "Pagos realizados"; también acepta archivos viejos con hoja "Pagos") |
| `components/Plataforma.tsx` | Pantalla principal (resumen + tarjetas de lotes) |
| `components/LoteDetalle.tsx` | Pantalla de detalle de un lote |
| `components/modales.tsx` | Formularios (lote, propietario, compromisos, registrar pago, generar plan) |
| `components/Usuarios.tsx` + `app/api/usuarios` | Administración de usuarios (solo editores) |

## Reglas de negocio implementadas
- **Estado de un compromiso** (calculado, no guardado) con la fecha de hoy **en hora de Colombia**:
  sin pago → *Retrasado* si la fecha ya pasó, si no *Pendiente*; con pago → *Pago parcial* si pagó
  menos, *Pagado con retraso* si pagó después, si no *Al día*.
- **Plan automático**: cuotas intermedias cada 1/2/3/6/12 meses desde la inicial y antes de la final;
  el restante se reparte en partes iguales. Si no cabe ninguna intermedia, el restante se suma a la final.
  Pide confirmación antes de reemplazar un plan existente.
- **Importar Excel** reemplaza toda la información en una sola operación: si algo falla, no se borra nada.
