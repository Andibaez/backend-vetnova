# ui-ux-pro-max

Aplica principios avanzados de UI/UX al diseño de la API, contratos de datos y experiencia del desarrollador (DX) para el backend de VetNova.

## Principios a aplicar

### 1. API Design (REST Best Practices)
- Recursos en plural y en minúsculas (`/propietarios`, `/mascotas`, `/citas`)
- Verbos HTTP correctos: GET (leer), POST (crear), PUT (reemplazar), PATCH (actualizar), DELETE (eliminar)
- Respuestas consistentes con estructura estándar:
  ```json
  {
    "data": {...},
    "message": "Operación exitosa",
    "statusCode": 200
  }
  ```
- Paginación en listados: `?page=1&limit=10` con metadata (`total`, `pages`, `hasNext`)
- Filtros y búsqueda: `?search=rex&especie=perro&estado=activo`
- Ordenamiento: `?sortBy=nombre&order=asc`

### 2. Error Responses (UX para el frontend)
- Mensajes de error claros y en español para VetNova
- Estructura consistente de errores:
  ```json
  {
    "error": "MASCOTA_NO_ENCONTRADA",
    "message": "No se encontró una mascota con el ID proporcionado",
    "statusCode": 404,
    "timestamp": "2026-06-04T...",
    "path": "/mascotas/123"
  }
  ```
- Errores de validación detallados (campo por campo)

### 3. Naming Conventions (DX)
- Nombres de campos en camelCase en JSON
- IDs como `id` nunca como `mascota_id` en el root del objeto
- Fechas en ISO 8601 (`fechaCreacion`, `fechaNacimiento`)
- Booleanos con prefijo `is`/`has`/`puede` (`isActivo`, `hasPropietario`)

### 4. Documentación Swagger
- Cada endpoint con descripción clara
- Ejemplos de request/response en cada DTO
- Tags organizados por módulo
- Endpoints de health check documentados

## Instrucciones

1. Analiza los controllers y DTOs del módulo indicado por el usuario
2. Si no se indica módulo, revisa todos
3. Identifica inconsistencias vs. los principios anteriores
4. Propone y aplica correcciones
5. Genera un reporte de mejoras de UX para el equipo de frontend

**Recuerda**: Este es un sistema veterinario en español — los mensajes deben estar en español y los nombres de campos deben ser intuitivos para un usuario hispanohablante.
