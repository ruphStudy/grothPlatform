import { Controller, Get, Logger, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SocialEngineService } from '../engine/social-engine.service';
import { parsePlatformParam } from './dto/validate-platform.util';
import { OAuthStateService } from './services/oauth-state.service';
import { SocialConnectionsService } from './services/social-connections.service';
import { buildCallbackUrl, buildFrontendRedirectUrl } from './social-oauth-callback.util';

/**
 * Public OAuth redirect target (18B item 21). Deliberately unguarded — the
 * browser arrives here directly from the provider's redirect, carrying no
 * bearer token. ALL tenant/user identity comes from the signed, one-time
 * OAuthState (item 19/22); org/product/platform are never trusted from the
 * callback query itself. Every failure path redirects to the frontend with
 * only a coarse status — never a token, code, or state value.
 */
@Controller('social-connections/oauth')
export class SocialOAuthCallbackController {
  private readonly logger = new Logger(SocialOAuthCallbackController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly socialEngine: SocialEngineService,
    private readonly oauthStateService: OAuthStateService,
    private readonly socialConnectionsService: SocialConnectionsService,
  ) {}

  @Get(':platform/callback')
  async callback(
    @Param('platform') platformParam: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() res: Response,
  ) {
    let platform;
    try {
      platform = parsePlatformParam(platformParam);
    } catch {
      return res.redirect(buildFrontendRedirectUrl(this.configService, 'linkedin', 'error'));
    }

    if (providerError || !code || !state) {
      this.logger.log(`platform=${platform} outcome=rejected reason=missing_code_or_state`);
      return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'error'));
    }

    let bound;
    try {
      bound = await this.oauthStateService.consume(state, platform);
    } catch {
      this.logger.log(`platform=${platform} outcome=rejected reason=invalid_state`);
      return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'error'));
    }

    try {
      const redirectUri = buildCallbackUrl(this.configService, platform);
      const authResult = await this.socialEngine.exchangeAuthorizationCode(platform, { code, redirectUri });
      await this.socialConnectionsService.upsertFromAuthResult(bound.organizationId, bound.productId, authResult, authResult.platform, bound.userId);
      this.logger.log(`platform=${platform} org=${bound.organizationId} product=${bound.productId} outcome=connected`);
      return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'success'));
    } catch (err) {
      this.logger.log(`platform=${platform} org=${bound.organizationId} product=${bound.productId} outcome=failed`);
      return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'error'));
    }
  }
}
