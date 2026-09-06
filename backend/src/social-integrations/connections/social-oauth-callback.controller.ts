import { Controller, Get, Logger, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SocialNoEligibleAccountError, SocialProviderError } from '../errors/social.errors';
import { SocialEngineService } from '../engine/social-engine.service';
import { parsePlatformParam } from './dto/validate-platform.util';
import { MetaAccountSelectionService } from './services/meta-account-selection.service';
import { OAuthStateService } from './services/oauth-state.service';
import { SocialConnectionsService } from './services/social-connections.service';
import { buildCallbackUrl, buildFrontendRedirectUrl, buildFrontendSelectionRedirectUrl } from './social-oauth-callback.util';

/**
 * Public OAuth redirect target (18B item 21). Deliberately unguarded — the
 * browser arrives here directly from the provider's redirect, carrying no
 * bearer token. ALL tenant/user identity comes from the signed, one-time
 * OAuthState (item 19/22); org/product/platform are never trusted from the
 * callback query itself. Every failure path redirects to the frontend with
 * only a coarse status — never a token, code, or state value.
 *
 * 18E/18F: this stays the ONE generic callback for every platform (item
 * 35). Facebook/Instagram simply branch here on
 * getCapabilities().accountDiscovery — exchange still happens exactly
 * once either way; only what happens with the resulting access token
 * differs (direct upsert vs. discover-then-select).
 */
@Controller('social-connections/oauth')
export class SocialOAuthCallbackController {
  private readonly logger = new Logger(SocialOAuthCallbackController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly socialEngine: SocialEngineService,
    private readonly oauthStateService: OAuthStateService,
    private readonly socialConnectionsService: SocialConnectionsService,
    private readonly metaAccountSelectionService: MetaAccountSelectionService,
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
      const authResult = await this.socialEngine.exchangeAuthorizationCode(platform, { code, redirectUri, codeVerifier: bound.codeVerifier });
      const provider = this.socialEngine.resolveProvider(platform);

      if (provider.getCapabilities().accountDiscovery) {
        const outcome = await this.metaAccountSelectionService.resolveOrCreatePending(platform, authResult.accessToken, bound.organizationId, bound.productId, bound.userId, authResult.platform);
        if (outcome.pendingSelectionId) {
          this.logger.log(`platform=${platform} org=${bound.organizationId} product=${bound.productId} outcome=selection_required`);
          return res.redirect(buildFrontendSelectionRedirectUrl(this.configService, platform, outcome.pendingSelectionId, bound.organizationId, bound.productId));
        }
        this.logger.log(`platform=${platform} org=${bound.organizationId} product=${bound.productId} outcome=connected`);
        return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'success'));
      }

      await this.socialConnectionsService.upsertFromAuthResult(bound.organizationId, bound.productId, authResult, authResult.platform, bound.userId);
      this.logger.log(`platform=${platform} org=${bound.organizationId} product=${bound.productId} outcome=connected`);
      return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'success'));
    } catch (err) {
      this.logger.log(`platform=${platform} org=${bound.organizationId} product=${bound.productId} outcome=failed`);
      const errorCode = err instanceof SocialProviderError || err instanceof SocialNoEligibleAccountError ? err.code : undefined;
      return res.redirect(buildFrontendRedirectUrl(this.configService, platform, 'error', errorCode));
    }
  }
}
