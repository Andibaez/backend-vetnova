# Conectar VetNova Backend con NeonDB

## 1. Crear la base de datos en NeonDB

1. Ve a [neon.tech](https://neon.tech) e inicia sesión (puedes usar GitHub).
2. Crea un nuevo proyecto → dale nombre `vetnova`.
3. En el dashboard, ve a **Connection Details** y copia la **Connection string**.
   Tendrá este formato:
   ```
   postgresql://usuario:password@ep-xxx-yyy.us-east-2.aws.neon.tech/vetnova?sslmode=require
   ```

## 2. Configurar la variable de entorno

Crea el archivo `.env` en la raíz del backend:

```bash
# Copia .env.example y pega tu connection string real
cp .env.example .env
```

Edita `.env` y reemplaza `DATABASE_URL`:

```env
DATABASE_URL="postgresql://usuario:password@ep-xxx-yyy.us-east-2.aws.neon.tech/vetnova?sslmode=require"
PORT=3000
ALLOWED_ORIGINS="http://localhost:3001"
```

> **Importante:** NeonDB requiere `?sslmode=require` al final de la URL.

## 3. Ejecutar las migraciones de Prisma

```bash
# Genera el cliente de Prisma
npx prisma generate

# Aplica el esquema a la base de datos (crea las tablas)
npx prisma db push

# Opcional: ver los datos en el navegador
npx prisma studio
```

## 4. Iniciar el backend

```bash
npm run start:dev
```

El servidor quedará disponible en `http://localhost:3000`  
La documentación Swagger estará en `http://localhost:3000/api`

## 5. Verificar la conexión

Abre en el navegador o Postman:

```
GET http://localhost:3000/propietarios
```

Si responde `[]` (array vacío), la conexión con NeonDB está funcionando correctamente.

---

## Solución de problemas comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `Can't reach database server` | `DATABASE_URL` incorrecta o sin `sslmode=require` | Revisar la URL copiada de NeonDB |
| `P1001: Can't reach database` | Proyecto NeonDB pausado (plan gratuito se pausa) | Abre neon.tech y reactiva el proyecto |
| `PrismaClientInitializationError` | `.env` no existe | Ejecutar `cp .env.example .env` |
