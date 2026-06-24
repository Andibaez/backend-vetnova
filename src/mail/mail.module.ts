import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Módulo global: el transporter de nodemailer se configura una sola vez
 * y MailService queda disponible en toda la app sin necesidad de
 * importarlo explícitamente en cada módulo de feature.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
