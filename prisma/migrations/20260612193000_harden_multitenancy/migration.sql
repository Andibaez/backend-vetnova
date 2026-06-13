-- Harden tenant isolation after moving auth to httpOnly cookies.
-- This migration is intentionally defensive for existing non-empty databases:
-- it backfills missing tenant fields before enforcing NOT NULL constraints.

INSERT INTO clinicas (nombre, slug, estado)
VALUES ('VetNova Default', 'vetnova-default', 'activa')
ON CONFLICT (slug) DO NOTHING;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE usuarios u
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE u.id_clinica IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM roles r
    WHERE r.id_rol = u.id_rol
      AND r.nombre = 'SuperAdministrador'
  );

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE propietarios p
SET id_clinica = COALESCE(p.id_clinica, u.id_clinica, (SELECT id_clinica FROM default_clinic))
FROM usuarios u
WHERE p.id_usuario = u.id_usuario
  AND p.id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE propietarios
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE mascotas m
SET id_clinica = COALESCE(m.id_clinica, p.id_clinica, (SELECT id_clinica FROM default_clinic))
FROM propietarios p
WHERE m.id_propietario = p.id_propietario
  AND m.id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE mascotas
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE citas c
SET id_clinica = COALESCE(
  c.id_clinica,
  (SELECT m.id_clinica FROM mascotas m WHERE m.id_mascota = c.id_mascota),
  (SELECT u.id_clinica FROM usuarios u WHERE u.id_usuario = c.id_usuario),
  (
    SELECT vu.id_clinica
    FROM veterinarios v
    JOIN usuarios vu ON vu.id_usuario = v.id_usuario
    WHERE v.id_veterinario = c.id_veterinario
  ),
  (SELECT id_clinica FROM default_clinic)
)
WHERE c.id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE citas
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE productos
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE servicios
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE id_clinica IS NULL;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS id_clinica INTEGER;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE facturas f
SET id_clinica = COALESCE(
  f.id_clinica,
  (SELECT p.id_clinica FROM propietarios p WHERE p.id_propietario = f.id_propietario),
  (SELECT m.id_clinica FROM mascotas m WHERE m.id_mascota = f.id_mascota),
  (SELECT id_clinica FROM default_clinic)
)
WHERE f.id_clinica IS NULL;

WITH default_clinic AS (
  SELECT id_clinica FROM clinicas WHERE slug = 'vetnova-default' LIMIT 1
)
UPDATE facturas
SET id_clinica = (SELECT id_clinica FROM default_clinic)
WHERE id_clinica IS NULL;

ALTER TABLE citas ALTER COLUMN id_clinica SET NOT NULL;
ALTER TABLE facturas ALTER COLUMN id_clinica SET NOT NULL;
ALTER TABLE mascotas ALTER COLUMN id_clinica SET NOT NULL;
ALTER TABLE productos ALTER COLUMN id_clinica SET NOT NULL;
ALTER TABLE propietarios ALTER COLUMN id_clinica SET NOT NULL;
ALTER TABLE servicios ALTER COLUMN id_clinica SET NOT NULL;

ALTER TABLE facturas
  ADD CONSTRAINT facturas_id_clinica_fkey
  FOREIGN KEY (id_clinica) REFERENCES clinicas(id_clinica)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

DELETE FROM roles r
WHERE r.nombre = 'Recepcionista'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id_rol = r.id_rol
  );
