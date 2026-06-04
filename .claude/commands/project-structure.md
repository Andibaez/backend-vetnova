# project-structure

Analiza y mejora la estructura del proyecto NestJS/Node.js para que siga las mejores prácticas de arquitectura modular, escalabilidad y mantenibilidad.

## Instrucciones

### Fase 1 — Auditoría
1. Lee toda la estructura de `src/` recursivamente
2. Lee `prisma/schema.prisma`
3. Lee `package.json` y `tsconfig.json`
4. Identifica problemas en:
   - **Módulos**: ¿Están bien encapsulados? ¿Hay dependencias circulares?
   - **DTOs**: ¿Usan class-validator? ¿Están separados por create/update?
   - **Services**: ¿Tienen lógica de negocio separada del controlador?
   - **Controllers**: ¿Solo manejan HTTP? ¿Tienen decoradores correctos?
   - **Prisma**: ¿El schema refleja bien el dominio? ¿Faltan índices o relaciones?
   - **Auth**: ¿Guards implementados correctamente?
   - **Archivos huérfanos**: Archivos que no pertenecen a ningún módulo

### Fase 2 — Reporte
Genera un reporte con:
```
ESTRUCTURA ACTUAL
├── ✅ Lo que está bien
├── ⚠️  Lo que puede mejorar (bajo impacto)
└── ❌ Lo que debe corregirse (alto impacto)

ESTRUCTURA RECOMENDADA
[árbol de carpetas ideal para este proyecto]

ACCIONES PRIORITARIAS
1. [acción concreta]
2. [acción concreta]
...
```

### Fase 3 — Aplicar (solo si el usuario lo pide)
Aplica las correcciones de alto impacto una por una, comenzando por las que no rompan código existente.

**Contexto del proyecto**: VetNova — sistema veterinario con módulos de propietarios, mascotas, citas, productos, servicios y usuarios.
