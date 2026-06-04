# nest-best-practices

Aplica las mejores prácticas de NestJS al código actual o al módulo indicado por el usuario. Revisa y corrige de forma proactiva.

## Checklist de mejores prácticas a aplicar

### DTOs y Validación
- [ ] Todos los DTOs usan `class-validator` (`@IsString`, `@IsEmail`, `@IsNotEmpty`, etc.)
- [ ] Todos los DTOs usan `class-transformer` (`@Transform`, `@Exclude`)
- [ ] Existe DTO separado para Create y Update (`PartialType` para Update)
- [ ] El `ValidationPipe` está habilitado globalmente en `main.ts` con `whitelist: true` y `forbidNonWhitelisted: true`
- [ ] Los DTOs tienen `@ApiProperty()` para documentación Swagger

### Controllers
- [ ] Usan decoradores de ruta correctos (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`)
- [ ] Tienen `@ApiTags()` y decoradores Swagger
- [ ] Usan `@Param('id', ParseIntPipe)` o `ParseUUIDPipe` según corresponda
- [ ] Están protegidos con `@UseGuards()` donde corresponde
- [ ] Retornan DTOs de respuesta, no entidades Prisma directas

### Services
- [ ] Toda la lógica de negocio está en el service, no en el controller
- [ ] Usan `try/catch` con excepciones NestJS (`NotFoundException`, `ConflictException`, etc.)
- [ ] No exponen datos sensibles (passwords, tokens) en las respuestas
- [ ] Las operaciones Prisma están encapsuladas en el service

### Módulos
- [ ] Cada módulo exporta solo lo que otros módulos necesitan
- [ ] `PrismaModule` es global (`@Global()`) o importado donde se necesita
- [ ] No hay imports circulares

### Seguridad
- [ ] Passwords hasheadas con bcrypt (nunca en texto plano)
- [ ] JWT configurado con expiración
- [ ] Variables sensibles en `.env`, nunca hardcodeadas
- [ ] Rate limiting con `@nestjs/throttler`
- [ ] CORS configurado correctamente

## Instrucciones

1. Si el usuario especifica un módulo (ej: `citas`, `propietarios`), revisa solo ese módulo
2. Si no especifica, revisa todos los módulos modificados en `git status`
3. Por cada problema encontrado: muestra el código actual, explica el problema y aplica la corrección
4. Al finalizar muestra un resumen de cambios aplicados
