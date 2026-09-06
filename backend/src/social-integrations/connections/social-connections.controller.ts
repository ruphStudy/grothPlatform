import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ProductsService } from '../../products/products.service';
import { SocialEngineService } from '../engine/social-engine.service';
import { parsePlatformParam } from './dto/validate-platform.util';
import { OAuthStateService } from './services/oauth-state.service';
import { SocialConnectionsService } from './services/social-connections.service';
import { buildCallbackUrl } from './social-oauth-callback.util';

// Tenant safety: the same cheap Product ownership check used elsewhere
// (never rebuilds Growth Strategy, never touches a campaign — connections
// are product-scoped only, per item 17).
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/social-connections')
export class SocialConnectionsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly socialEngine: SocialEngineService,
    private readonly oauthStateService: OAuthStateService,
    private readonly socialConnectionsService: SocialConnectionsService,
  ) {}

  @Post(':platform/authorize')
  async authorize(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('platform') platformParam: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    const platform = parsePlatformParam(platformParam);

    const state = await this.oauthStateService.create({ organizationId, productId, platform, userId: req.user.userId });
    const redirectUri = buildCallbackUrl(this.configService, platform);
    const { url, codeVerifier } = this.socialEngine.buildAuthorizationUrl(platform, { redirectUri, state });
    // PKCE providers (18D: X) hand back a code_verifier here — persisted
    // server-side against the just-created state, never in the response.
    if (codeVerifier) {
      await this.oauthStateService.attachCodeVerifier(state, codeVerifier);
    }
    return { authorizationUrl: url, state };
  }

  @Get()
  async list(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.socialConnectionsService.list(organizationId, productId);
  }

  @Get(':connectionId')
  async get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.socialConnectionsService.get(organizationId, productId, connectionId);
  }

  @Delete(':connectionId')
  async disconnect(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.socialConnectionsService.disconnect(organizationId, productId, connectionId);
  }

  @Post(':connectionId/validate')
  async validate(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('connectionId') connectionId: string,
  ) {
    await this.productsService.findOne(organizationId, productId, req.user.userId);
    return this.socialConnectionsService.validate(organizationId, productId, connectionId);
  }
}
