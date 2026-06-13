import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding roles y usuario administrador...');

  // 1. Crear todos los roles si no existen
  const roles = ['SuperAdministrador', 'Administrador', 'Veterinario', 'Cliente'];
  for (const nombre of roles) {
    await prisma.roles.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    console.log(`  ✔ Rol "${nombre}" listo`);
  }

  // 2. Clínica principal (tenant por defecto para los datos de ejemplo)
  const principal = await prisma.clinicas.upsert({
    where: { slug: 'principal' },
    update: {},
    create: { nombre: 'VetNova - Sede Principal', slug: 'principal' },
  });
  console.log(`  ✔ Clínica "${principal.nombre}" lista (id ${principal.id_clinica})`);

  // 3. Crear usuario administrador inicial
  const adminEmail = 'admin@vetnova.com';
  const adminPassword = 'Admin123!';

  const rolAdmin = await prisma.roles.findUnique({ where: { nombre: 'Administrador' } });
  if (!rolAdmin) throw new Error('Rol Administrador no encontrado');

  const existe = await prisma.usuarios.findFirst({ where: { email: adminEmail } });
  if (existe) {
    console.log(`  ⚠  Ya existe usuario admin (${adminEmail}), saltando.`);
  } else {
    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.usuarios.create({
      data: {
        nombre: 'Administrador VetNova',
        email: adminEmail,
        password: hashed,
        id_rol: rolAdmin.id_rol,
        id_clinica: principal.id_clinica,
      },
    });
    console.log(`\n  ✅ Admin creado:`);
    console.log(`     Email:    ${adminEmail}`);
    console.log(`     Password: ${adminPassword}`);
  }

  // 4. Veterinario de prueba
  const vetEmail = 'vet@vetnova.com';
  const rolVet = await prisma.roles.findUnique({ where: { nombre: 'Veterinario' } });
  const existeVet = await prisma.usuarios.findFirst({ where: { email: vetEmail } });
  if (!existeVet && rolVet) {
    const hashed = await bcrypt.hash('Vet1234!', 10);
    const vet = await prisma.usuarios.create({
      data: {
        nombre: 'Dr. Juan Pérez',
        email: vetEmail,
        password: hashed,
        id_rol: rolVet.id_rol,
        id_clinica: principal.id_clinica,
      },
    });
    await prisma.veterinarios.create({ data: { id_usuario: vet.id_usuario } });
    console.log(`  ✅ Veterinario de prueba: ${vetEmail} / Vet1234!`);
  }

  // 5. Super administrador (sin clínica asignada)
  const superAdminEmail = 'superadmin@vetnova.com';
  const superAdminPassword = 'SuperAdmin123!';

  const rolSuperAdmin = await prisma.roles.findUnique({ where: { nombre: 'SuperAdministrador' } });
  if (!rolSuperAdmin) throw new Error('Rol SuperAdministrador no encontrado');

  const existeSuperAdmin = await prisma.usuarios.findFirst({ where: { email: superAdminEmail } });
  if (existeSuperAdmin) {
    console.log(`  ⚠  Ya existe usuario super admin (${superAdminEmail}), saltando.`);
  } else {
    const hashed = await bcrypt.hash(superAdminPassword, 10);
    await prisma.usuarios.create({
      data: {
        nombre: 'Super Administrador VetNova',
        email: superAdminEmail,
        password: hashed,
        id_rol: rolSuperAdmin.id_rol,
        id_clinica: null,
      },
    });
    console.log(`\n  ✅ Super admin creado:`);
    console.log(`     Email:    ${superAdminEmail}`);
    console.log(`     Password: ${superAdminPassword}`);
  }

  console.log('\n🎉 Seed completado.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
