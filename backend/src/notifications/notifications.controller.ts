import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationQueryDto } from './dto/notifications.dto';
import { InAppNotificationService } from './services/in-app-notification.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: InAppNotificationService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }, @Query() query: NotificationQueryDto) {
    return this.notifications.list(req.user.userId, query);
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: { userId: string } }, @Query('productId') productId?: string) {
    return this.notifications.unreadCount(req.user.userId, productId);
  }

  @Post(':id/read')
  markRead(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.notifications.markRead(req.user.userId, id);
  }

  @Post('read-all')
  markAllRead(@Req() req: { user: { userId: string } }, @Body() body: { productId?: string }) {
    return this.notifications.markAllRead(req.user.userId, body?.productId);
  }
}
