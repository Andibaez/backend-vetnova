# fix-errors

Escanea el proyecto en busca de errores, bugs, y problemas de código, y los corrige automáticamente.

## Instrucciones

### Fase 1 — Detección automática
Ejecuta en paralelo todas estas verificaciones:

1. **TypeScript**: Corre `npx tsc --noEmit` y captura todos los errores de tipos
2. **ESLint**: Corre `npx eslint src/ --ext .ts` y captura warnings y errores
3. **Imports rotos**: Busca imports que referencien archivos inexistentes
4. **Variables no usadas**: Detecta imports, variables y parámetros sin usar
5. **Prisma**: Verifica que todos los modelos del schema tengan su módulo NestJS correspondiente
6. **DTOs incompletos**: Campos requeridos sin decoradores de validación
7. **Dependencias faltantes**: Referencias a paquetes no instalados en `package.json`

### Fase 2 — Clasificación
Clasifica cada error encontrado:

| Severidad | Criterio |
|-----------|----------|
| 🔴 CRÍTICO | Error de compilación, null pointer potencial, security issue |
| 🟠 ALTO    | Bug lógico, validación faltante, tipo incorrecto |
| 🟡 MEDIO   | Warning de linting, código muerto, import no usado |
| 🟢 BAJO    | Estilo, naming convention, comentario obsoleto |

### Fase 3 — Corrección
1. Corrige todos los errores 🔴 CRÍTICO primero
2. Luego 🟠 ALTO
3. Pregunta al usuario antes de corregir 🟡 y 🟢 en masa
4. Para cada corrección: muestra qué archivo/línea, qué estaba mal, qué se corrigió

### Fase 4 — Verificación
Después de aplicar correcciones:
1. Corre `npx tsc --noEmit` de nuevo para confirmar 0 errores TypeScript
2. Corre `npm run build` si existe el script
3. Reporta el estado final: "X errores corregidos, 0 errores restantes"

## Modo de uso
- `/fix-errors` → escanea todo el proyecto
- `/fix-errors src/citas/` → escanea solo ese módulo
- `/fix-errors --ts-only` → solo errores TypeScript
- `/fix-errors --lint-only` → solo errores de linting

**Nunca** uses `// @ts-ignore` o `any` como solución. Corrige el tipo real.
