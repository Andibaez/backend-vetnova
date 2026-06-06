import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('MAIL_HOST'),
      port: config.get<number>('MAIL_PORT') ?? 587,
      secure: config.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: config.get<string>('MAIL_USER'),
        pass: config.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendPasswordReset(to: string, nombre: string, resetLink: string) {
    const from = this.config.get<string>('MAIL_FROM') ?? this.config.get<string>('MAIL_USER');

    await this.transporter.sendMail({
      from: `"VetNova" <${from}>`,
      to,
      subject: 'Recuperación de contraseña — VetNova',
      html: this.resetTemplate(nombre, resetLink),
    });

    this.logger.log(`Reset password email sent to ${to}`);
  }

  private resetTemplate(nombre: string, resetLink: string) {
    return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#1a1a1a;">Recuperación de contraseña</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en VetNova.</p>
        <p>Haz clic en el botón para crear una nueva contraseña. Este enlace es válido por <strong>1 hora</strong>.</p>
        <a href="${resetLink}"
           style="display:inline-block;margin:24px 0;padding:12px 28px;background:#4f46e5;
                  color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
          Restablecer contraseña
        </a>
        <p style="color:#666;font-size:13px;">
          Si no solicitaste esto, ignora este mensaje. Tu contraseña no cambiará.
        </p>
        <p style="color:#666;font-size:13px;">
          O copia este enlace en tu navegador:<br>
          <a href="${resetLink}" style="color:#4f46e5;">${resetLink}</a>
        </p>
      </div>
    `;
  }
}
