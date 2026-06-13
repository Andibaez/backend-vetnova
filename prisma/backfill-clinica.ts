import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRINCIPAL_SLUG = 'principal';
const PRINCIPAL_NOMBRE = 'VetNova - Sede Principal';

async function main() {
  console.log('🏥 Backfill de clínica principal...');

  let principal = await prisma.clinicas.findUnique({ where: { slug: PRINCIPAL_SLUG } });
  if (!principal) {
    principal = await prisma.clinicas.create({
      data: { nombre: PRINCIPAL_NOMBRE, slug: PRINCIPAL_SLUG },
    });
    console.log(`  ✔ Clínica creada: ${principal.nombre} (id ${principal.id_clinica})`);
  } else {
    console.log(`  ⚠ Clínica "${PRINCIPAL_SLUG}" ya existe (id ${principal.id_clinica}), reutilizando.`);
  }

  const id_clinica = principal.id_clinica;

  const resultados = await Promise.all([
    prisma.$executeRaw`
      UPDATE usuarios
      SET id_clinica = ${id_clinica}
      WHERE id_clinica IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM roles
          WHERE roles.id_rol = usuarios.id_rol
            AND roles.nombre = 'SuperAdministrador'
        )
    `,
    prisma.$executeRaw`UPDATE propietarios SET id_clinica = ${id_clinica} WHERE id_clinica IS NULL`,
    prisma.$executeRaw`UPDATE mascotas SET id_clinica = ${id_clinica} WHERE id_clinica IS NULL`,
    prisma.$executeRaw`UPDATE citas SET id_clinica = ${id_clinica} WHERE id_clinica IS NULL`,
    prisma.$executeRaw`UPDATE productos SET id_clinica = ${id_clinica} WHERE id_clinica IS NULL`,
    prisma.$executeRaw`UPDATE servicios SET id_clinica = ${id_clinica} WHERE id_clinica IS NULL`,
  ]);

  const tablas = ['usuarios', 'propietarios', 'mascotas', 'citas', 'productos', 'servicios'];
  resultados.forEach((count, i) => console.log(`  ✔ ${tablas[i]}: ${count} registros actualizados`));

  console.log('\n🎉 Backfill completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
