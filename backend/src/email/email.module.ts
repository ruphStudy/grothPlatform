import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmModule } from '../crm/crm.module';
import { ProductsModule } from '../products/products.module';
import { EmailCredentialEncryptionService } from './connections/email-credential-encryption.service';
import { EmailController } from './email.controller';
import { EmailEngineService } from './engine/email-engine.service';
import { EMAIL_PROVIDER_REGISTRY_TOKEN } from './providers/email-provider.tokens';
import type { EmailProvider } from './providers/email-provider.interface';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { EmailConnection, EmailConnectionSchema } from './schemas/email-connection.schema';
import { EmailMessage, EmailMessageSchema } from './schemas/email-message.schema';
import { EmailSender, EmailSenderSchema } from './schemas/email-sender.schema';
import { EmailCommunicationPolicyService } from './services/email-communication-policy.service';
import { EmailService } from './services/email.service';
import type { EmailPlatform } from './types/email.types';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailConnection.name, schema: EmailConnectionSchema },
      { name: EmailSender.name, schema: EmailSenderSchema },
      { name: EmailMessage.name, schema: EmailMessageSchema },
    ]),
    ProductsModule,
    CrmModule,
  ],
  controllers: [EmailController],
  providers: [
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER_REGISTRY_TOKEN,
      useFactory: (resend: ResendEmailProvider) => {
        const registry = new Map<EmailPlatform, EmailProvider>();
        registry.set('resend', resend);
        return registry;
      },
      inject: [ResendEmailProvider],
    },
    EmailCredentialEncryptionService,
    EmailEngineService,
    EmailCommunicationPolicyService,
    EmailService,
  ],
  exports: [EmailService, EmailEngineService],
})
export class EmailModule {}
