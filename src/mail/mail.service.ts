import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(to: string, nombre: string, resetLink: string) {
    const serviceId  = this.config.getOrThrow<string>('EMAILJS_SERVICE_ID');
    const templateId = this.config.getOrThrow<string>('EMAILJS_TEMPLATE_RESET');
    const publicKey  = this.config.getOrThrow<string>('EMAILJS_PUBLIC_KEY');
    const privateKey = this.config.getOrThrow<string>('EMAILJS_PRIVATE_KEY');

    const body = {
      service_id:      serviceId,
      template_id:     templateId,
      user_id:         publicKey,
      accessToken:     privateKey,
      template_params: {
        to_email:   to,
        to_name:    nombre,
        reset_link: resetLink,
        subject:    'Recuperación de contraseña — VetNova',
        message:    `Hola ${nombre}, haz clic en el enlace para restablecer tu contraseña. Expira en 1 hora.`,
      },
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`EmailJS error ${res.status}: ${detail}`);
      throw new InternalServerErrorException('No se pudo enviar el correo de recuperación.');
    }

    this.logger.log(`Reset password email sent to ${to}`);
  }
}
