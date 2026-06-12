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
    prisma.usuarios.updateMany({
      where: { id_clinica: null, roles: { nombre: { not: 'SuperAdministrador' } } },
      data: { id_clinica },
    }),
    prisma.propietarios.updateMany({ where: { id_clinica: null }, data: { id_clinica } }),
    prisma.mascotas.updateMany({ where: { id_clinica: null }, data: { id_clinica } }),
    prisma.citas.updateMany({ where: { id_clinica: null }, data: { id_clinica } }),
    prisma.productos.updateMany({ where: { id_clinica: null }, data: { id_clinica } }),
    prisma.servicios.updateMany({ where: { id_clinica: null }, data: { id_clinica } }),
  ]);

  const tablas = ['usuarios', 'propietarios', 'mascotas', 'citas', 'productos', 'servicios'];
  resultados.forEach((r, i) => console.log(`  ✔ ${tablas[i]}: ${r.count} registros actualizados`));

  console.log('\n🎉 Backfill completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
