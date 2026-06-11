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
| `Administrador` | `Administrador` | Panel `/admin` — gestión total |
| `Veterinario` | `Veterinario` | Panel `/veterinario` — citas y pacientes asignados |
| `Cliente` | `Cliente` | Panel `/cliente` — sus mascotas y citas |
| *(faltante)* | `SuperAdministrador` | Panel `/super-admin` — gestión de clínicas |

> ⚠️ El rol `SuperAdministrador` y el módulo `/clinicas` existen en el frontend pero **no están implementados en el backend aún**.

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

| Email | Password | Rol |
|---|---|---|
| `admin@vetnova.com` | `Admin123!` | Administrador |
| `vet@vetnova.com` | `Vet1234!` | Veterinario |
| `recepcion@vetnova.com` | `Recep123!` | Recepcionista |

---

## Módulos del backend

| Módulo | Endpoints base | Roles |
|---|---|---|
| `auth` | `/auth/register`, `/auth/login`, `/auth/google`, `/auth/me`, `/auth/forgot-password`, `/auth/reset-password` | Público / Autenticado |
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

### Flujo JWT
1. `POST /auth/login` → backend devuelve `{ token, user: { id, name, email, role } }`
2. Frontend guarda el token en cookie `vetnova-token` (httpOnly, secure en prod)
3. El proxy universal `app/api/backend/[...path]/route.ts` añade `Authorization: Bearer <token>` en cada request al backend
4. `JwtAuthGuard` (global) verifica el token en cada endpoint no público
5. `RolesGuard` (global) verifica el rol según el decorador `@Roles()` del endpoint

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
- `usuarios` — cuenta de acceso, vinculada a un rol
- `roles` — Administrador, Veterinario, Recepcionista, Cliente
- `propietarios` — perfil de cliente (1:1 con usuario Cliente)
- `veterinarios` — perfil de veterinario (1:1 con usuario Veterinario)
- `recepcionistas` — perfil de recepcionista (1:1 con usuario)
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
| JWT httpOnly cookie | Frontend (`lib/server-auth.ts`) |
| Rate limiting global (60 req/min) | Backend (`ThrottlerModule`) |
| Rate limiting por endpoint | `@Throttle` en auth endpoints |
| Helmet (headers de seguridad) | Backend (`main.ts`) |
| CORS restringido | Backend (`main.ts`, `ALLOWED_ORIGINS`) |
| ValidationPipe whitelist | Backend (rechaza campos no declarados en DTOs) |
| Roles guard global | Backend (`RolesGuard`) |
| Reset token con hash de contraseña | Backend (`auth.service.ts`) |
| Reset token bloqueado como Bearer | Backend (`jwt-auth.guard.ts`) |
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
| `/super-admin/*` | SuperAdministrador *(backend pendiente)* |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Público |

### Proxy universal
`app/api/backend/[...path]/route.ts` — reenvía todas las peticiones al backend con el token JWT adjunto. Evita CORS y mantiene el token seguro en el servidor.

---

## Pendientes conocidos

### Backend
- [ ] Módulo `clinicas` (SuperAdministrador — CRUD + by-slug)
- [ ] Rol `SuperAdministrador` en constantes y guards
- [ ] Campo `clinicaId` en respuesta de `/auth/me`, `/auth/login`, `/auth/register`
- [ ] GitHub Secrets (`DATABASE_URL`, `DIRECT_URL`) para que el CI corra

### Frontend
- [ ] Integrar endpoints nuevos: recordatorios, historias clínicas, facturas
- [ ] Manejar `429 Too Many Requests` en reset-password
- [ ] Formularios de registro/cambio de contraseña con requisitos de complejidad visibles
- [ ] Panel `/super-admin` conectado al backend

---

## CI/CD

### Backend (`.github/workflows/ci.yml`)
Corre en cada push/PR a `main`: install → prisma generate → lint → build → npm audit

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
