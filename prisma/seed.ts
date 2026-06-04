import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding roles y usuario administrador...');

  // 1. Crear los 4 roles si no existen
  const roles = ['Administrador', 'Veterinario', 'Recepcionista', 'Cliente'];
  for (const nombre of roles) {
    await prisma.roles.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    console.log(`  ✔ Rol "${nombre}" listo`);
  }

  // 2. Crear usuario administrador inicial
  const adminEmail = 'admin@vetnova.com';
  const adminPassword = 'Admin123!';

  const rolAdmin = await prisma.roles.findUnique({ where: { nombre: 'Administrador' } });
  if (!rolAdmin) throw new Error('Rol Administrador no encontrado');

  const existe = await prisma.usuarios.findUnique({ where: { email: adminEmail } });
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
      },
    });
    console.log(`\n  ✅ Admin creado:`);
    console.log(`     Email:    ${adminEmail}`);
    console.log(`     Password: ${adminPassword}`);
  }

  // 3. Veterinario de prueba
  const vetEmail = 'vet@vetnova.com';
  const rolVet = await prisma.roles.findUnique({ where: { nombre: 'Veterinario' } });
  const existeVet = await prisma.usuarios.findUnique({ where: { email: vetEmail } });
  if (!existeVet && rolVet) {
    const hashed = await bcrypt.hash('Vet1234!', 10);
    const vet = await prisma.usuarios.create({
      data: {
        nombre: 'Dr. Juan Pérez',
        email: vetEmail,
        password: hashed,
        id_rol: rolVet.id_rol,
      },
    });
    await prisma.veterinarios.create({ data: { id_usuario: vet.id_usuario } });
    console.log(`  ✅ Veterinario de prueba: ${vetEmail} / Vet1234!`);
  }

  // 4. Recepcionista de prueba
  const recepEmail = 'recepcion@vetnova.com';
  const rolRecep = await prisma.roles.findUnique({ where: { nombre: 'Recepcionista' } });
  const existeRecep = await prisma.usuarios.findUnique({ where: { email: recepEmail } });
  if (!existeRecep && rolRecep) {
    const hashed = await bcrypt.hash('Recep123!', 10);
    const recep = await prisma.usuarios.create({
      data: {
        nombre: 'María López',
        email: recepEmail,
        password: hashed,
        id_rol: rolRecep.id_rol,
      },
    });
    await prisma.recepcionistas.create({ data: { id_usuario: recep.id_usuario } });
    console.log(`  ✅ Recepcionista de prueba: ${recepEmail} / Recep123!`);
  }

  console.log('\n🎉 Seed completado.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
