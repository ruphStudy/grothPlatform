import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../services/team.service';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const permissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) || [];
    if (!permissions.length) return true;
    const request = context.switchToHttp().getRequest();
    const organizationId = request.params.organizationId || request.params.id;
    const productId = request.params.productId;
    const userId = request.user?.userId;
    for (const permission of permissions) await this.authz.assertPermission(organizationId, userId, permission, productId);
    return true;
  }
}
