# VetNova — Contexto del Proyecto

Sistema de gestión veterinaria con múltiples roles. Arquitectura cliente-servidor desacoplada.

---

## Estructura general

```
C:\Users\ad\
├── backend-vetnova/     ← NestJS API (este repo)
└── Vet_Nova\frontend\   ← Next.js 16 (repo separado)
```

**Backend:** `http://localhost:3000`
**Frontend:** `http://localhost:3001`

---

## Stack

| Capa | Tecnología |
|---|---|
| API | NestJS 11, TypeScript |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL en NeonDB (cloud) |
| Autenticación | JWT (`@nestjs/jwt`), Google OAuth (`google-auth-library`) |
| Email | Nodemailer + Gmail App Password |
| Validación | class-validator + class-transformer |
| Documentación | Swagger (`@nestjs/swagger`) en `/api` |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Imágenes | Cloudinary |
| Rate limiting | ThrottlerModule (backend) + Upstash Redis (frontend) |

---

## Roles del sistema

| Rol (backend) | Rol (frontend) | Acceso |
|---|---|---|
| `SuperAdministrador` | `SuperAdministrador` | Panel `/super-admin` — gestión de clínicas (sin `id_clinica`, ve todo) |
| `Administrador` | `Administrador` | Panel `/admin` — gestión total de su clínica |
| `Veterinario` | `Veterinario` | Panel `/veterinario` — citas y pacientes de su clínica |
| `Cliente` | `Cliente` | Panel `/cliente` — sus mascotas y citas |

> El sistema es **multi-tenant**: cada usuario (excepto `SuperAdministrador`) pertenece a una `clinica` (`id_clinica`) y solo ve datos de esa clínica. El registro público requiere un slug de clínica (`/register?clinica=<slug>`).

---

## Variables de entorno

### Backend (`backend-vetnova/.env`)
```env
DATABASE_URL="postgresql://...@...neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://...@...neon.tech/neondb?sslmode=require"   # sin -pooler, para migraciones
PORT=3000
ALLOWED_ORIGINS="http://localhost:3001"
JWT_SECRET="..."         # mínimo 32 chars, una sola línea
JWT_EXPIRES_IN="10d"
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
FRONTEND_URL="http://localhost:3001"
GMAIL_USER="correo@gmail.com"
GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
```

### Frontend (`Vet_Nova/frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_URL=...
EMAILJS_SERVICE_ID=...
EMAILJS_PUBLIC_KEY=...
```

---

## Comandos de desarrollo

### Backend
```bash
npm run start:dev      # dev con hot reload
npm run build          # compilar TypeScript
npm test               # correr tests (Jest)
npx prisma generate    # regenerar cliente Prisma
npx prisma db push     # sincronizar schema con NeonDB (requiere hotspot si el puerto 5432 está bloqueado)
npx prisma db seed     # seed inicial (roles + usuarios de prueba)
npx prisma studio      # explorador visual de la BD
```

### Frontend
```bash
npm run dev            # dev en puerto 3001
npm run build          # build de producción
npm test               # Vitest
npm run lint           # ESLint
```

---

## Usuarios de prueba (seed)

| Email | Password | Rol | Clínica |
|---|---|---|---|
| `superadmin@vetnova.com` | `SuperAdmin123!` | SuperAdministrador | (ninguna) |
| `admin@vetnova.com` | `Admin123!` | Administrador | `principal` |
| `vet@vetnova.com` | `Vet1234!` | Veterinario | `principal` |

> El rol `Recepcionista` (y el modelo `recepcionistas`) existían antes del refactor multi-tenancy y se **eliminaron deliberadamente** en `dev`. No hay usuario de prueba ni endpoints asociados.

---

## Módulos del backend

| Módulo | Endpoints base | Roles |
|---|---|---|
| `auth` | `/auth/register`, `/auth/login`, `/auth/google`, `/auth/me`, `/auth/csrf`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` | Público / Autenticado |
| `clinicas` | `/clinicas/activas`, `/clinicas/by-slug/:slug` (público); `/clinicas` CRUD | SuperAdministrador (CRUD), público (activas/by-slug) |
| `usuarios` | `/usuarios` | Admin (gestión), cualquier rol (update propio) |
| `mascotas` | `/mascotas` | Admin + Vet (CRUD), Cliente (lectura propia) |
| `propietarios` | `/propietarios` | Admin (total), Vet (sus pacientes), Cliente (propio) |
| `citas` | `/citas` | Admin + Vet + Cliente (con filtros por rol) |
| `veterinarios` | `/veterinarios/me` | Solo Veterinario |
| `productos` | `/productos` | Admin + Vet |
| `servicios` | `/servicios` | Todos (GET), Admin (CUD) |
| `notificaciones` | `/notificaciones` | Todos (cada uno ve las suyas) |
| `historias-clinicas` | `/historias-clinicas/mascota/:id`, `/historias-clinicas/consultas` | Admin + Vet (write), Cliente (read propio) |
| `recordatorios` | `/recordatorios` | Admin + Vet (CUD), Cliente (read) |
| `facturas` | `/facturas` | Admin (total), Cliente (lectura propia) |

---

## Autenticación

### Flujo JWT (cookies httpOnly + CSRF)
1. `POST /auth/login` / `/auth/register` / `/auth/google` → el backend setea dos cookies en su propia respuesta:
   - `vetnova-token` (httpOnly, `SameSite=Lax`, `Secure` solo en prod, ~10 días) — el JWT de sesión
   - `vetnova-csrf` (NO httpOnly, mismo resto de opciones) — token CSRF legible por JS
   - El body de respuesta es `{ user, csrfToken }` (ya **no** incluye `token`)
   - Si el email tiene cuentas en varias clínicas y no se manda `clinicaSlug`, responde `{ requiresClinicSelection: true, clinicas: [...] }` sin cookies
2. `GET /auth/me` devuelve el usuario (incluye `clinicaId`/`clinicaNombre`) — requiere cookie `vetnova-token`
3. `JwtAuthGuard` (global) lee el JWT **solo** de la cookie `vetnova-token`; **ya no acepta `Authorization: Bearer`**
4. `CsrfGuard` (global) exige, para métodos no seguros (POST/PUT/PATCH/DELETE) en endpoints no `@Public()`, que el header `x-csrf-token` coincida con la cookie `vetnova-csrf`
5. `RolesGuard` (global) verifica el rol según el decorador `@Roles()`; el `SuperAdministrador` no tiene `id_clinica` y ve datos de todas las clínicas (`tenant.util.ts`)
6. `POST /auth/logout` limpia ambas cookies; `GET /auth/csrf` (público) emite una `vetnova-csrf` nueva si falta

> ⚠️ **El frontend (`feat/frontend-changes`) todavía implementa el contrato viejo** (esperaba `token` en el body, lo mandaba como `Authorization: Bearer` vía el proxy). Esto rompe el login (el usuario es regresado a `/login` tras `/auth/me` 401). Ver "Pendientes → Frontend".

### Reset de contraseña
- El token de reset se firma con `JWT_SECRET + hash_contraseña_actual`
- Una vez usado (contraseña cambiada), el token es inválido automáticamente
- El token de reset **no puede usarse como Bearer** de autenticación (guard lo rechaza)

### Google OAuth
- Frontend recibe `credential` de Google Sign-In
- Lo envía a `POST /auth/google` con el `id_token`
- Backend verifica con `google-auth-library` usando `GOOGLE_CLIENT_ID`

---

## Base de datos (schema Prisma)

### Modelos principales
- `clinicas` — tenant: nombre, slug, dirección, coordenadas (lat/long), estado
- `usuarios` — cuenta de acceso, vinculada a un rol y (excepto SuperAdmin) a una clínica
- `roles` — SuperAdministrador, Administrador, Veterinario, Cliente
- `propietarios` — perfil de cliente (1:1 con usuario Cliente)
- `veterinarios` — perfil de veterinario (1:1 con usuario Veterinario)
- `mascotas` — mascotas vinculadas a un propietario
- `citas` — citas entre mascota, usuario y veterinario
- `historias_clinicas` — historia clínica por mascota (1:1)
- `consultas` — consultas dentro de una historia clínica
- `facturas` — facturas vinculadas a propietario y mascota
- `detalle_productos` / `detalle_servicios` — líneas de factura
- `productos` — inventario de productos
- `servicios` — catálogo de servicios
- `recordatorios` — recordatorios vinculados a mascotas
- `notificaciones` — sistema de notificaciones internas

### Conexión NeonDB
- `DATABASE_URL` → URL con `-pooler` (PgBouncer) para runtime
- `DIRECT_URL` → URL sin `-pooler` para `prisma db push` / migraciones
- Puerto 5432 puede estar bloqueado en redes corporativas → usar hotspot

---

## Seguridad implementada

| Medida | Dónde |
|---|---|
| JWT en cookie httpOnly (`vetnova-token`) | Backend (`auth.controller.ts`, la setea el propio backend) |
| CSRF de doble cookie (`vetnova-csrf` + header `x-csrf-token`) | Backend (`csrf.guard.ts`) |
| Aislamiento multi-tenant por `id_clinica` | Backend (`tenant.util.ts`, todos los services) |
| Rate limiting global (60 req/min) | Backend (`ThrottlerModule`) |
| Rate limiting por endpoint | `@Throttle` en auth endpoints |
| Helmet (headers de seguridad) | Backend (`main.ts`) |
| CORS restringido | Backend (`main.ts`, `ALLOWED_ORIGINS`) |
| ValidationPipe whitelist | Backend (rechaza campos no declarados en DTOs) |
| Roles guard global | Backend (`RolesGuard`) |
| Reset token con hash de contraseña | Backend (`auth.service.ts`) |
| Reset token bloqueado como sesión | Backend (`jwt-auth.guard.ts`) |
| Contraseña: 8 chars + mayúscula + número + especial | Backend (DTOs) |
| Log injection prevention | Backend (`logging.middleware.ts`) |
| CSP dinámico con nonce | Frontend (`middleware.ts`) |
| Cloudinary — imágenes en cloud | Frontend |

---

## Frontend — estructura de rutas

| Ruta | Rol requerido |
|---|---|
| `/admin/*` | Administrador |
| `/veterinario/*` | Veterinario |
| `/cliente/*` | Cliente |
| `/super-admin/*` | SuperAdministrador |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Público |

### Proxy universal
`app/api/backend/[...path]/route.ts` — reenvía todas las peticiones al backend. **Pendiente**: el proxy y las rutas de auth (`login`/`register`/`google`/`logout`) todavía implementan el contrato viejo (`Authorization: Bearer` + cookie propia del frontend) y no reenvían `Cookie`/`x-csrf-token`, por lo que el login no persiste sesión contra el backend actual. Ver "Pendientes → Frontend".

---

## Pendientes conocidos

### Backend
- [ ] Verificar/aplicar en NeonDB la migración `20260612193000_harden_multitenancy` (correr `npx prisma migrate status` / `deploy` desde una red sin bloqueo al puerto 5432)
- [ ] Configurar GitHub Secrets (`DATABASE_URL`, `DIRECT_URL`) para que el CI corra `prisma generate`/`build`

### Frontend (`feat/frontend-changes`) — **crítico, bloquea el login**
- [ ] Adaptar al nuevo contrato de auth: cookies httpOnly (`vetnova-token`, `vetnova-csrf`) + header `x-csrf-token`, en vez de `Authorization: Bearer`
  - `app/api/auth/login|register|google/route.ts`: reenviar `Set-Cookie` del backend con `getSetCookie()`
  - `app/api/auth/logout/route.ts`: llamar a `POST /auth/logout` del backend y reenviar las cookies de limpieza
  - `app/api/backend/[...path]/route.ts`: reenviar `Cookie` y `x-csrf-token` en cada request; eliminar `Authorization`/`getAuthToken`
  - `app/api/cloudinary/upload/route.ts`: usar `Cookie` en vez de `Authorization: Bearer`
  - Eliminar `lib/server-auth.ts` y su test (ya no se necesita cookie propia del frontend)
  - Nuevo helper CSRF: leer `vetnova-csrf` de `document.cookie` y mandarlo como `x-csrf-token` en mutaciones
- [ ] Implementar UI de `requiresClinicSelection` en `LoginForm.tsx` (selector de clínica cuando un email tiene cuentas en varias)
- [ ] Integrar endpoints faltantes: `lib/api/facturas.ts`, `historias-clinicas.ts`, `recordatorios.ts` + pantallas
- [ ] Manejar `429 Too Many Requests` en reset-password
- [ ] Formularios de registro/cambio de contraseña con requisitos de complejidad visibles
- [ ] (Cosmético) renombrar `lib/recepcionista/` — solo son tipos compartidos (`Appointment`, `PetRecord`, `Owner`), el rol ya no existe

---

## CI/CD

### Backend (`.github/workflows/ci.yml`)
Corre en cada push/PR a `main` y `dev`: install (`postinstall` regenera el cliente Prisma automáticamente) → prisma generate → lint → build → npm audit. Los pasos de `prisma generate`/`build` requieren `DATABASE_URL`/`DIRECT_URL` como GitHub Secrets (pendiente de configurar).

### Frontend
Ya tiene su propio workflow de CI.

---

## Tests

### Backend (Jest)
- `src/auth/auth.service.spec.ts` — register, login, forgotPassword, resetPassword
- `src/usuarios/usuarios.service.spec.ts` — update (permisos), remove (cascade)
- `src/citas/citas.service.spec.ts` — create (ownership), findOne, update (notificaciones)
- `src/propietarios/propietarios.service.spec.ts` — findAll (filtro por rol), findOne, delete

### Frontend (Vitest + Playwright)
- Tests unitarios con Vitest
- Tests E2E con Playwright
