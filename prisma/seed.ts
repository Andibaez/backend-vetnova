import { PrismaClient } from '@prisma/client';
import { fakerES as faker } from '@faker-js/faker';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Reproducible: misma "aleatoriedad" en cada corrida, para que los datos
// decorativos (teléfonos, direcciones, motivos) no cambien sin necesidad.
faker.seed(20260625);

const DEMO_PASSWORD = 'Demo1234!';
const DEMO_EMAIL_DOMAIN = 'vetnova-demo.com';

// ─── Catálogos fijos (realistas, en español) ───────────────────────────────

const ESPECIES: { especie: string; razas: string[] }[] = [
  {
    especie: 'Perro',
    razas: [
      'Labrador',
      'Golden Retriever',
      'Bulldog Francés',
      'Pastor Alemán',
      'Schnauzer',
      'Poodle',
      'Chihuahua',
      'Criollo',
    ],
  },
  {
    especie: 'Gato',
    razas: ['Criollo', 'Persa', 'Siamés', 'Maine Coon', 'Esfinge', 'Angora'],
  },
  { especie: 'Ave', razas: ['Canario', 'Periquito', 'Cacatúa', 'Loro'] },
  { especie: 'Conejo', razas: ['Holland Lop', 'Mini Rex', 'Criollo'] },
];

const SERVICIOS_CATALOGO = [
  { nombre: 'Consulta general', precioBase: 60000 },
  { nombre: 'Vacunación', precioBase: 45000 },
  { nombre: 'Desparasitación', precioBase: 35000 },
  { nombre: 'Cirugía menor', precioBase: 250000 },
  { nombre: 'Baño y peluquería', precioBase: 50000 },
  { nombre: 'Radiografía', precioBase: 120000 },
  { nombre: 'Limpieza dental', precioBase: 150000 },
];

const PRODUCTOS_CATALOGO = [
  {
    nombre: 'Alimento premium perro 15kg',
    tipo: 'Alimento',
    precioBase: 180000,
  },
  { nombre: 'Alimento premium gato 7kg', tipo: 'Alimento', precioBase: 120000 },
  {
    nombre: 'Antipulgas y garrapatas',
    tipo: 'Antiparasitario',
    precioBase: 45000,
  },
  {
    nombre: 'Desparasitante interno',
    tipo: 'Antiparasitario',
    precioBase: 25000,
  },
  { nombre: 'Shampoo medicado', tipo: 'Higiene', precioBase: 38000 },
  { nombre: 'Suplemento vitamínico', tipo: 'Suplemento', precioBase: 55000 },
  { nombre: 'Arenero para gatos', tipo: 'Accesorio', precioBase: 30000 },
  { nombre: 'Correa y collar', tipo: 'Accesorio', precioBase: 42000 },
];

const VACUNAS_CATALOGO = [
  { nombre: 'Rabia', frecuencia_dias: 365 },
  { nombre: 'Parvovirus', frecuencia_dias: 365 },
  { nombre: 'Moquillo', frecuencia_dias: 365 },
  { nombre: 'Leptospirosis', frecuencia_dias: 365 },
  { nombre: 'Triple Felina', frecuencia_dias: 365 },
  { nombre: 'Bordetella', frecuencia_dias: 180 },
  { nombre: 'Hepatitis infecciosa canina', frecuencia_dias: 365 },
  { nombre: 'Coronavirus felino', frecuencia_dias: 365 },
];

const MOTIVOS_CONSULTA = [
  'Control anual',
  'Vómito y letargo',
  'Pérdida de apetito',
  'Revisión post-cirugía',
  'Cojera en pata trasera',
  'Picazón y alergia en piel',
  'Chequeo de rutina',
  'Diarrea persistente',
];

const CIUDADES_CO = [
  'Medellín',
  'Bogotá',
  'Cali',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Cartagena',
  'Envigado',
  'Itagüí',
  'Armenia',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function randomDateBetween(start: Date, end: Date): Date {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

/** Estado realista de una cita en función de si su fecha ya pasó o no. */
function estadoCitaPara(fecha: Date): string {
  const esPasada = fecha.getTime() < Date.now();
  if (esPasada) {
    return faker.helpers.weightedArrayElement([
      { value: 'finalizada', weight: 6 },
      { value: 'cancelada', weight: 2 },
      { value: 'no asistió', weight: 1 },
    ]);
  }
  return faker.helpers.weightedArrayElement([
    { value: 'pendiente', weight: 3 },
    { value: 'confirmada', weight: 5 },
    { value: 'reprogramada', weight: 1 },
  ]);
}

// ─── Bootstrap fijo (roles + clínica principal + usuarios de prueba) ──────
// Se conserva igual que antes de la siembra masiva: estas credenciales ya
// se usan en documentación y verificaciones manuales del proyecto.

async function seedBootstrap() {
  console.log('🌱 Seeding roles y usuarios base...');

  const rolesNombres = [
    'SuperAdministrador',
    'Administrador',
    'Veterinario',
    'Cliente',
  ];
  const roles: Record<string, { id_rol: number }> = {};
  for (const nombre of rolesNombres) {
    roles[nombre] = await prisma.roles.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
  }
  console.log(`  ✔ ${rolesNombres.length} roles listos`);

  const principal = await prisma.clinicas.upsert({
    where: { slug: 'principal' },
    update: {},
    create: { nombre: 'VetNova - Sede Principal', slug: 'principal' },
  });
  console.log(
    `  ✔ Clínica "${principal.nombre}" lista (id ${principal.id_clinica})`,
  );

  const adminEmail = 'admin@vetnova.com';
  const existeAdmin = await prisma.usuarios.findFirst({
    where: { email: adminEmail },
  });
  if (!existeAdmin) {
    const hashed = await bcrypt.hash('Admin123!', 10);
    await prisma.usuarios.create({
      data: {
        nombre: 'Administrador VetNova',
        email: adminEmail,
        password: hashed,
        id_rol: roles['Administrador'].id_rol,
        id_clinica: principal.id_clinica,
      },
    });
    console.log(`  ✅ Admin creado: ${adminEmail} / Admin123!`);
  } else {
    console.log(`  ⚠  Ya existe usuario admin (${adminEmail}), saltando.`);
  }

  const vetEmail = 'vet@vetnova.com';
  const existeVet = await prisma.usuarios.findFirst({
    where: { email: vetEmail },
  });
  if (!existeVet) {
    const hashed = await bcrypt.hash('Vet1234!', 10);
    const vet = await prisma.usuarios.create({
      data: {
        nombre: 'Dr. Juan Pérez',
        email: vetEmail,
        password: hashed,
        id_rol: roles['Veterinario'].id_rol,
        id_clinica: principal.id_clinica,
      },
    });
    await prisma.veterinarios.create({ data: { id_usuario: vet.id_usuario } });
    console.log(`  ✅ Veterinario de prueba: ${vetEmail} / Vet1234!`);
  } else {
    console.log(
      `  ⚠  Ya existe veterinario de prueba (${vetEmail}), saltando.`,
    );
  }

  const superAdminEmail = 'superadmin@vetnova.com';
  const existeSuperAdmin = await prisma.usuarios.findFirst({
    where: { email: superAdminEmail },
  });
  if (!existeSuperAdmin) {
    const hashed = await bcrypt.hash('SuperAdmin123!', 10);
    await prisma.usuarios.create({
      data: {
        nombre: 'Super Administrador VetNova',
        email: superAdminEmail,
        password: hashed,
        id_rol: roles['SuperAdministrador'].id_rol,
        id_clinica: null,
      },
    });
    console.log(`  ✅ Super admin creado: ${superAdminEmail} / SuperAdmin123!`);
  } else {
    console.log(`  ⚠  Ya existe super admin (${superAdminEmail}), saltando.`);
  }

  return { roles, principal };
}

// ─── Catálogo global de vacunas ────────────────────────────────────────────

async function seedVacunas() {
  console.log('\n🌱 Seeding catálogo de vacunas...');
  const vacunas: {
    id_vacuna: number;
    nombre: string | null;
    frecuencia_dias: number | null;
  }[] = [];
  for (const v of VACUNAS_CATALOGO) {
    const existing = await prisma.vacunas.findFirst({
      where: { nombre: v.nombre },
    });
    const vacuna = existing ?? (await prisma.vacunas.create({ data: v }));
    vacunas.push(vacuna);
  }
  console.log(`  ✔ ${vacunas.length} vacunas en el catálogo`);
  return vacunas;
}

// ─── Siembra masiva multi-clínica ───────────────────────────────────────────

const TOTAL_CLINICAS = 50;

async function seedClinicasYDatos(
  roles: Record<string, { id_rol: number }>,
  vacunasDisponibles: {
    id_vacuna: number;
    nombre: string | null;
    frecuencia_dias: number | null;
  }[],
) {
  console.log(
    `\n🌱 Seeding ${TOTAL_CLINICAS} clínicas demo con datos relacionados...`,
  );

  const contadores = {
    clinicas: 0,
    usuarios: 0,
    propietarios: 0,
    veterinarios: 0,
    mascotas: 0,
    citas: 0,
    consultas: 0,
    registroVacunas: 0,
    servicios: 0,
    productos: 0,
  };

  for (let i = 1; i <= TOTAL_CLINICAS; i++) {
    const ciudad = faker.helpers.arrayElement(CIUDADES_CO);
    const nombreClinica = `${faker.helpers.arrayElement(['VetCare', 'Clínica Veterinaria', 'Centro Veterinario', 'VetLife', 'Mundo Animal', 'Patitas'])} ${ciudad} ${i}`;
    const slug = `demo-${slugify(nombreClinica)}-${i}`;

    const clinica = await prisma.clinicas.upsert({
      where: { slug },
      update: {},
      create: {
        nombre: nombreClinica,
        slug,
        direccion: faker.location.streetAddress(),
        telefono: faker.phone.number({ style: 'national' }),
        email: `contacto@${slug}.com`,
        estado: 'activa',
      },
    });
    contadores.clinicas++;

    // Administrador de la clínica
    const adminEmail = `admin${i}@${DEMO_EMAIL_DOMAIN}`;
    let adminUsuario = await prisma.usuarios.findFirst({
      where: { email: adminEmail, id_clinica: clinica.id_clinica },
    });
    if (!adminUsuario) {
      const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);
      adminUsuario = await prisma.usuarios.create({
        data: {
          nombre: faker.person.fullName(),
          email: adminEmail,
          password: hashed,
          id_rol: roles['Administrador'].id_rol,
          id_clinica: clinica.id_clinica,
        },
      });
    }
    contadores.usuarios++;

    // Servicios y productos del catálogo de la clínica
    for (const s of SERVICIOS_CATALOGO) {
      const existing = await prisma.servicios.findFirst({
        where: { id_clinica: clinica.id_clinica, nombre: s.nombre },
      });
      if (!existing) {
        await prisma.servicios.create({
          data: {
            nombre: s.nombre,
            precio: s.precioBase + faker.number.int({ min: -5000, max: 15000 }),
            id_clinica: clinica.id_clinica,
          },
        });
        contadores.servicios++;
      }
    }
    for (const p of PRODUCTOS_CATALOGO) {
      const existing = await prisma.productos.findFirst({
        where: { id_clinica: clinica.id_clinica, nombre: p.nombre },
      });
      if (!existing) {
        await prisma.productos.create({
          data: {
            nombre: p.nombre,
            tipo: p.tipo,
            precio: p.precioBase + faker.number.int({ min: -3000, max: 10000 }),
            stock: faker.number.int({ min: 0, max: 80 }),
            id_clinica: clinica.id_clinica,
          },
        });
        contadores.productos++;
      }
    }

    // Veterinarios (1-2 por clínica)
    const numVets = faker.number.int({ min: 1, max: 2 });
    const veterinariosClinica: {
      id_veterinario: number;
      id_usuario: number;
    }[] = [];
    for (let v = 1; v <= numVets; v++) {
      const vetEmail = `vet${i}-${v}@${DEMO_EMAIL_DOMAIN}`;
      let vetUsuario = await prisma.usuarios.findFirst({
        where: { email: vetEmail, id_clinica: clinica.id_clinica },
      });
      if (!vetUsuario) {
        const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);
        vetUsuario = await prisma.usuarios.create({
          data: {
            nombre: `Dr. ${faker.person.fullName()}`,
            email: vetEmail,
            password: hashed,
            id_rol: roles['Veterinario'].id_rol,
            id_clinica: clinica.id_clinica,
          },
        });
      }
      contadores.usuarios++;

      let veterinario = await prisma.veterinarios.findUnique({
        where: { id_usuario: vetUsuario.id_usuario },
      });
      if (!veterinario) {
        veterinario = await prisma.veterinarios.create({
          data: {
            id_usuario: vetUsuario.id_usuario,
            especialidad: faker.helpers.arrayElement([
              'Medicina general',
              'Cirugía',
              'Dermatología',
              'Odontología veterinaria',
              'Medicina interna',
            ]),
            licencia: faker.string.alphanumeric(8).toUpperCase(),
            horario_atencion: 'Lunes a sábado, 8am - 6pm',
            telefono: faker.phone.number({ style: 'national' }),
          },
        });
      }
      contadores.veterinarios++;
      veterinariosClinica.push(veterinario);
    }

    // Propietarios/clientes (2-4 por clínica) con sus mascotas
    const numPropietarios = faker.number.int({ min: 2, max: 4 });
    for (let c = 1; c <= numPropietarios; c++) {
      const clienteEmail = `cliente${i}-${c}@${DEMO_EMAIL_DOMAIN}`;
      const nombreCliente = faker.person.fullName();
      let clienteUsuario = await prisma.usuarios.findFirst({
        where: { email: clienteEmail, id_clinica: clinica.id_clinica },
      });
      if (!clienteUsuario) {
        const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);
        clienteUsuario = await prisma.usuarios.create({
          data: {
            nombre: nombreCliente,
            email: clienteEmail,
            password: hashed,
            id_rol: roles['Cliente'].id_rol,
            id_clinica: clinica.id_clinica,
          },
        });
      }
      contadores.usuarios++;

      let propietario = await prisma.propietarios.findUnique({
        where: { id_usuario: clienteUsuario.id_usuario },
      });
      if (!propietario) {
        propietario = await prisma.propietarios.create({
          data: {
            nombre: nombreCliente,
            telefono: faker.phone.number({ style: 'national' }),
            direccion: faker.location.streetAddress(),
            email: clienteEmail,
            documento: faker.string.numeric(10),
            estado: 'activo',
            id_usuario: clienteUsuario.id_usuario,
            id_clinica: clinica.id_clinica,
          },
        });
      }
      contadores.propietarios++;

      // Mascotas del propietario (1-3)
      const numMascotas = faker.number.int({ min: 1, max: 3 });
      for (let m = 1; m <= numMascotas; m++) {
        const nombreMascota = faker.person.firstName();
        let mascota = await prisma.mascotas.findFirst({
          where: {
            id_propietario: propietario.id_propietario,
            nombre: nombreMascota,
          },
        });
        if (!mascota) {
          const grupo = faker.helpers.arrayElement(ESPECIES);
          mascota = await prisma.mascotas.create({
            data: {
              nombre: nombreMascota,
              especie: grupo.especie,
              raza: faker.helpers.arrayElement(grupo.razas),
              edad: faker.number.int({ min: 0, max: 14 }),
              peso: faker.number.float({
                min: 1.5,
                max: 45,
                fractionDigits: 1,
              }),
              id_propietario: propietario.id_propietario,
              sexo: faker.helpers.arrayElement(['Macho', 'Hembra']),
              id_clinica: clinica.id_clinica,
            },
          });
        }
        contadores.mascotas++;

        // Historia clínica + 0-2 consultas pasadas
        const numConsultas = faker.number.int({ min: 0, max: 2 });
        if (numConsultas > 0) {
          let historia = await prisma.historias_clinicas.findUnique({
            where: { id_mascota: mascota.id_mascota },
          });
          if (!historia) {
            historia = await prisma.historias_clinicas.create({
              data: { id_mascota: mascota.id_mascota },
            });
          }
          for (let k = 0; k < numConsultas; k++) {
            const fechaConsulta = randomDateBetween(
              new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
              new Date(),
            );
            const yaExiste = await prisma.consultas.findFirst({
              where: {
                id_historia: historia.id_historia,
                fecha: fechaConsulta,
              },
            });
            if (!yaExiste) {
              const vetAsignado =
                faker.helpers.arrayElement(veterinariosClinica);
              await prisma.consultas.create({
                data: {
                  fecha: fechaConsulta,
                  motivo: faker.helpers.arrayElement(MOTIVOS_CONSULTA),
                  diagnostico: faker.lorem.sentence(),
                  tratamiento: faker.lorem.sentence(),
                  peso: faker.number.float({
                    min: 1.5,
                    max: 45,
                    fractionDigits: 1,
                  }),
                  temperatura: faker.number.float({
                    min: 37.5,
                    max: 39.5,
                    fractionDigits: 1,
                  }),
                  frecuencia_cardiaca: faker.number.int({ min: 60, max: 160 }),
                  recomendaciones: faker.lorem.sentence(),
                  id_historia: historia.id_historia,
                  id_usuario: vetAsignado.id_usuario,
                },
              });
              contadores.consultas++;
            }
          }
        }

        // Registro de vacunas (0-2), algunas con próxima dosis cercana
        // (para poder probar el recordatorio de vacunas próximas a vencer).
        const numVacunas = faker.number.int({ min: 0, max: 2 });
        for (let k = 0; k < numVacunas; k++) {
          const vacuna = faker.helpers.arrayElement(vacunasDisponibles);
          const fecha = randomDateBetween(
            new Date(Date.now() - 300 * 24 * 60 * 60 * 1000),
            new Date(),
          );
          const frecuenciaDias = vacuna.frecuencia_dias ?? 365;
          const proximaFecha = faker.datatype.boolean({ probability: 0.3 })
            ? new Date(
                Date.now() +
                  faker.number.int({ min: 1, max: 3 }) * 24 * 60 * 60 * 1000,
              )
            : new Date(fecha.getTime() + frecuenciaDias * 24 * 60 * 60 * 1000);

          const yaExiste = await prisma.registro_vacunas.findFirst({
            where: {
              id_mascota: mascota.id_mascota,
              id_vacuna: vacuna.id_vacuna,
              fecha,
            },
          });
          if (!yaExiste) {
            await prisma.registro_vacunas.create({
              data: {
                fecha,
                proxima_fecha: proximaFecha,
                id_mascota: mascota.id_mascota,
                id_vacuna: vacuna.id_vacuna,
              },
            });
            contadores.registroVacunas++;
          }
        }

        // Citas (1-4) distribuidas en pasado (6 meses) y futuro (2 meses)
        const numCitas = faker.number.int({ min: 1, max: 4 });
        for (let k = 0; k < numCitas; k++) {
          const fecha = randomDateBetween(
            new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
            new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          );
          const hora = `${faker.number.int({ min: 8, max: 17 }).toString().padStart(2, '0')}:${faker.helpers.arrayElement(['00', '30'])}`;

          const yaExiste = await prisma.citas.findFirst({
            where: { id_mascota: mascota.id_mascota, fecha, hora },
          });
          if (!yaExiste) {
            const vetAsignado = faker.datatype.boolean({ probability: 0.7 })
              ? faker.helpers.arrayElement(veterinariosClinica)
              : null;
            await prisma.citas.create({
              data: {
                fecha,
                hora,
                estado: estadoCitaPara(fecha),
                servicio: faker.helpers.arrayElement(SERVICIOS_CATALOGO).nombre,
                notas: faker.datatype.boolean({ probability: 0.3 })
                  ? faker.lorem.sentence()
                  : null,
                id_mascota: mascota.id_mascota,
                id_usuario: clienteUsuario.id_usuario,
                id_veterinario: vetAsignado?.id_veterinario ?? null,
                id_clinica: clinica.id_clinica,
              },
            });
            contadores.citas++;
          }
        }
      }
    }

    if (i % 10 === 0) {
      console.log(`  ... ${i}/${TOTAL_CLINICAS} clínicas procesadas`);
    }
  }

  return contadores;
}

async function main() {
  const { roles } = await seedBootstrap();
  const vacunas = await seedVacunas();
  const contadores = await seedClinicasYDatos(roles, vacunas);

  console.log(
    '\n📊 Resumen de la siembra masiva (creados en esta corrida, no incluye el bootstrap fijo):',
  );
  console.table(contadores);

  const totales = {
    clinicas: await prisma.clinicas.count(),
    usuarios: await prisma.usuarios.count(),
    propietarios: await prisma.propietarios.count(),
    veterinarios: await prisma.veterinarios.count(),
    mascotas: await prisma.mascotas.count(),
    citas: await prisma.citas.count(),
    servicios: await prisma.servicios.count(),
    productos: await prisma.productos.count(),
    vacunas: await prisma.vacunas.count(),
  };
  console.log('\n📊 Totales actuales en la base de datos:');
  console.table(totales);

  console.log('\n🎉 Seed completado.');
  console.log(
    `\nCredenciales demo (clínicas demo-*): admin{N}@${DEMO_EMAIL_DOMAIN} / vet{N}-{M}@${DEMO_EMAIL_DOMAIN} / cliente{N}-{M}@${DEMO_EMAIL_DOMAIN}, todas con password "${DEMO_PASSWORD}".`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
