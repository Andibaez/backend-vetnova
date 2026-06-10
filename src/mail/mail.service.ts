import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.config.getOrThrow<string>('GMAIL_USER'),
        pass: this.config.getOrThrow<string>('GMAIL_APP_PASSWORD'),
      },
    });
  }

  async sendPasswordReset(to: string, nombre: string, resetLink: string) {
    const user = this.config.getOrThrow<string>('GMAIL_USER');
    try {
      await transporter.sendMail({
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
      throw new InternalServerErrorException('No se pudo enviar el correo de recuperación.');
    }
  }
}
