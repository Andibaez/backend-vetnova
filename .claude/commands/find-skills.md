# find-skills

Analiza el contexto actual del proyecto y la tarea que el usuario quiere realizar, luego sugiere las mejores herramientas, librerías, patrones y skills disponibles para completarla.

## Instrucciones

1. Lee el `package.json` y `prisma/schema.prisma` para entender el stack actual
2. Lee el directorio `src/` para entender la arquitectura del proyecto
3. Identifica qué tipo de tarea quiere realizar el usuario (autenticación, CRUD, validación, testing, etc.)
4. Sugiere:
   - **Librerías npm** ya instaladas que pueden usarse
   - **Librerías npm** que sería útil instalar (con justificación)
   - **Patrones NestJS** recomendados para la tarea
   - **Skills de Claude Code** disponibles que aplican (`/code-review`, `/security-review`, `/fix-errors`, `/nest-best-practices`, etc.)
   - **Próximos pasos concretos** ordenados por prioridad

5. Si el usuario no especificó tarea, analiza el `git status` y sugiere skills para las modificaciones pendientes.

Sé específico y directo. No expliques lo que es NestJS o Prisma, el usuario ya lo sabe.
