import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { InAppNotification, InAppNotificationSchema } from './schemas/in-app-notification.schema';
import { InAppNotificationService } from './services/in-app-notification.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: InAppNotification.name, schema: InAppNotificationSchema }])],
  controllers: [NotificationsController],
  providers: [InAppNotificationService],
  exports: [InAppNotificationService],
})
export class NotificationsModule {}
