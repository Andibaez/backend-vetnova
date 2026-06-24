import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

type TemplateName =
  | 'appointment-confirmation'
  | 'appointment-reminder'
  | 'appointment-cancelled'
  | 'welcome'
  | 'admin-temp-password'
  | 'verify-email';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly templatesDir = path.join(__dirname, 'templates');
  private layoutTemplate: handlebars.TemplateDelegate | null = null;
  private readonly templateCache = new Map<
    TemplateName,
    handlebars.TemplateDelegate
  >();

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.getOrThrow<string>('GMAIL_USER'),
        pass: this.config.getOrThrow<string>('GMAIL_APP_PASSWORD'),
      },
      // Si el SMTP de Gmail no responde, fallar en segundos en vez de
      // colgar la petición HTTP por minutos (default de nodemailer).
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 8000,
    });
  }

  async sendPasswordReset(to: string, nombre: string, resetLink: string) {
    const user = this.config.getOrThrow<string>('GMAIL_USER');
    try {
      await this.transporter.sendMail({
        from: `"VetNova" <${user}>`,
        to,
        subject: 'Recuperación de contraseña — VetNova',
        html: `
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Haz clic en el siguiente enlace para restablecer tu contraseña. Expira en 1 hora.</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>Si no solicitaste esto, ignora este correo.</p>
        `,
      });
      this.logger.log(`Reset password email sent to ${to}`);
    } catch (err) {
      this.logger.error('Nodemailer error:', err);
      throw new InternalServerErrorException(
        'No se pudo enviar el correo de recuperación.',
      );
    }
  }

  /**
   * Envía la confirmación de una cita recién creada/confirmada.
   * Nunca lanza: un fallo de envío se loguea pero no debe interrumpir
   * el flujo de negocio (crear/actualizar la cita).
   */
  async sendAppointmentConfirmation(
    to: string,
    data: {
      nombre: string;
      mascota: string;
      fecha: string;
      hora: string;
      servicio?: string | null;
      veterinario?: string | null;
    },
  ) {
    await this.sendSafe(
      to,
      'Confirmación de tu cita — VetNova',
      'appointment-confirmation',
      data,
    );
  }

  /** Envía el recordatorio 24h antes de una cita confirmada. */
  async sendAppointmentReminder(
    to: string,
    data: {
      nombre: string;
      mascota: string;
      fecha: string;
      hora: string;
      servicio?: string | null;
      veterinario?: string | null;
    },
  ) {
    await this.sendSafe(
      to,
      'Recordatorio: tu cita es en menos de 24 horas — VetNova',
      'appointment-reminder',
      data,
    );
  }

  /** Envía la notificación de cancelación de una cita. */
  async sendAppointmentCancelled(
    to: string,
    data: { nombre: string; mascota: string; fecha: string; hora: string },
  ) {
    await this.sendSafe(
      to,
      'Tu cita fue cancelada — VetNova',
      'appointment-cancelled',
      data,
    );
  }

  /** Envía el correo de bienvenida al registrarse un nuevo usuario. */
  async sendWelcome(
    to: string,
    data: { nombre: string; clinica?: string | null; loginUrl?: string },
  ) {
    await this.sendSafe(to, 'Bienvenido a VetNova', 'welcome', data);
  }

  /**
   * Envía la contraseña temporal generada al asignar o reasignar un
   * administrador de clínica. Nunca registra la contraseña en logs.
   */
  async sendTemporaryPassword(
    to: string,
    data: {
      nombre: string;
      tempPassword: string;
      clinica?: string | null;
      loginUrl?: string;
    },
  ) {
    await this.sendSafe(
      to,
      'Tu contraseña temporal — VetNova',
      'admin-temp-password',
      data,
    );
  }

  /**
   * Envía el enlace de confirmación de correo al registrarse con
   * contraseña (el login con Google ya viene verificado por Google).
   */
  async sendVerifyEmail(
    to: string,
    data: { nombre: string; clinica?: string | null; verifyLink: string },
  ) {
    await this.sendSafe(
      to,
      'Confirma tu correo — VetNova',
      'verify-email',
      data,
    );
  }

  /**
   * Renderiza una plantilla y la envía, atrapando cualquier error para que
   * nunca se propague hacia la operación de negocio que lo invoca.
   */
  private async sendSafe(
    to: string,
    subject: string,
    template: TemplateName,
    context: Record<string, unknown>,
  ) {
    try {
      const html = this.render(template, context);
      const user = this.config.getOrThrow<string>('GMAIL_USER');
      await this.transporter.sendMail({
        from: `"VetNova" <${user}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email "${template}" enviado a ${to}`);
    } catch (err) {
      this.logger.error(
        `No se pudo enviar el email "${template}" a ${to}: ${
          (err as Error).message
        }`,
      );
    }
  }

  private render(template: TemplateName, context: Record<string, unknown>) {
    const body = this.getTemplate(template)(context);
    return this.getLayout()({ body });
  }

  private getLayout() {
    if (!this.layoutTemplate) {
      const source = fs.readFileSync(
        path.join(this.templatesDir, 'layout.hbs'),
        'utf-8',
      );
      this.layoutTemplate = handlebars.compile(source);
    }
    return this.layoutTemplate;
  }

  private getTemplate(name: TemplateName) {
    let compiled = this.templateCache.get(name);
    if (!compiled) {
      const source = fs.readFileSync(
        path.join(this.templatesDir, `${name}.hbs`),
        'utf-8',
      );
      compiled = handlebars.compile(source);
      this.templateCache.set(name, compiled);
    }
    return compiled;
  }
}
