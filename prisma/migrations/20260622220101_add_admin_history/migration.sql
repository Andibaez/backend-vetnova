-- CreateTable
CREATE TABLE "admin_history" (
    "id" SERIAL NOT NULL,
    "clinica_id" INTEGER NOT NULL,
    "previous_admin_id" INTEGER,
    "new_admin_id" INTEGER NOT NULL,
    "changed_by" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_history_clinica_id_idx" ON "admin_history"("clinica_id");

-- AddForeignKey
ALTER TABLE "admin_history" ADD CONSTRAINT "admin_history_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id_clinica") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_history" ADD CONSTRAINT "admin_history_previous_admin_id_fkey" FOREIGN KEY ("previous_admin_id") REFERENCES "usuarios"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_history" ADD CONSTRAINT "admin_history_new_admin_id_fkey" FOREIGN KEY ("new_admin_id") REFERENCES "usuarios"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "admin_history" ADD CONSTRAINT "admin_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "usuarios"("id_usuario") ON DELETE NO ACTION ON UPDATE NO ACTION;

