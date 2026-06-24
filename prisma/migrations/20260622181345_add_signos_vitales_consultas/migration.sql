-- AlterTable
ALTER TABLE "consultas" ADD COLUMN     "frecuencia_cardiaca" INTEGER,
ADD COLUMN     "peso" DECIMAL(5,2),
ADD COLUMN     "recomendaciones" TEXT,
ADD COLUMN     "temperatura" DECIMAL(4,1);

