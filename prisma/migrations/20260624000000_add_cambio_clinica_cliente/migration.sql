-- AlterTable
ALTER TABLE "consultas" ADD COLUMN     "archivada_por_migracion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "registro_vacunas" ADD COLUMN     "archivada_por_migracion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mascotas" ADD COLUMN     "resumen_clinicas_anteriores" JSONB;
