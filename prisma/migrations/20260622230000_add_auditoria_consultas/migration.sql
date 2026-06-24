-- AlterTable
ALTER TABLE "consultas" ADD COLUMN     "eliminada_at" TIMESTAMP(6);

-- CreateTable
CREATE TABLE "auditoria_consultas" (
    "id_auditoria" SERIAL NOT NULL,
    "id_consulta" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "accion" VARCHAR(20) NOT NULL,
    "motivo" TEXT,
    "datos_anteriores" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_consultas_pkey" PRIMARY KEY ("id_auditoria")
);

-- CreateIndex
CREATE INDEX "auditoria_consultas_id_consulta_idx" ON "auditoria_consultas"("id_consulta");

-- AddForeignKey
ALTER TABLE "auditoria_consultas" ADD CONSTRAINT "auditoria_consultas_id_consulta_fkey" FOREIGN KEY ("id_consulta") REFERENCES "consultas"("id_consulta") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auditoria_consultas" ADD CONSTRAINT "auditoria_consultas_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuarios"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

