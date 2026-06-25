import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

type TemplateName =
  | 'appointment-confirmation'
  | 'appointment-reminder'
  | 'appointment-cancelled'
  | 'appointment-rescheduled'
  | 'welcome'
  | 'admin-temp-password'
  | 'verify-email'
  | 'password-reset';

const FROM_ADDRESS = 'VetNova <notificaciones@vetnova.online>';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly templatesDir = path.join(__dirname, 'templates');
  private layoutTemplate: handlebars.TemplateDelegate | null = null;
  private readonly templateCache = new Map<
    TemplateName,
    handlebars.TemplateDelegate
  >();

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
  }

  async sendPasswordReset(to: string, nombre: string, resetLink: string) {
    await this.sendSafe(
      to,
      'Recuperación de contraseña — VetNova',
      'password-reset',
      {
        nombre,
        resetLink,
      },
    );
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

  /** Envía la notificación de reprogramación (cambio de fecha/hora) de una cita. */
  async sendAppointmentRescheduled(
    to: string,
    data: { nombre: string; mascota: string; fecha: string; hora: string },
  ) {
    await this.sendSafe(
      to,
      'Tu cita fue reprogramada — VetNova',
      'appointment-rescheduled',
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
   * Renderiza una plantilla y la envía vía Resend, atrapando cualquier
   * error para que nunca se propague hacia la operación de negocio que
   * lo invoca (crear una cita, registrar un usuario, etc. no deben
   * fallar porque el correo no pudo enviarse).
   */
  private async sendSafe(
    to: string,
    subject: string,
    template: TemplateName,
    context: Record<string, unknown>,
  ) {
    try {
      const html = this.render(template, context);
      const { error } = await this.resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      if (error) {
        this.logger.error(
          `No se pudo enviar el email "${template}" a ${to}: ${error.message}`,
        );
        return;
      }
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
