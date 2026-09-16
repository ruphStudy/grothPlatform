import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompleteOnboardingDto, CreateOnboardingOrganizationDto, CreateOnboardingProductDto, TourStateDto, UpdateOnboardingDto } from './dto/launch.dto';
import { LaunchReadinessService, LegalAcceptanceService, OnboardingService } from './launch.service';

@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalAcceptanceService) {}

  @Get('config')
  config() {
    return this.legal.versions();
  }
}

@UseGuards(JwtAuthGuard)
@Controller('me/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  get(@Req() req: { user: { userId: string } }) {
    return this.onboarding.get(req.user.userId);
  }

  @Patch()
  patch(@Req() req: { user: { userId: string } }, @Body() dto: UpdateOnboardingDto) {
    return this.onboarding.patch(req.user.userId, dto);
  }

  @Post('organization')
  createOrganization(@Req() req: { user: { userId: string } }, @Body() dto: CreateOnboardingOrganizationDto) {
    return this.onboarding.createOrganization(req.user.userId, dto);
  }

  @Post('product')
  createProduct(@Req() req: { user: { userId: string } }, @Body() dto: CreateOnboardingProductDto) {
    return this.onboarding.createProduct(req.user.userId, dto);
  }

  @Post('complete')
  complete(@Req() req: { user: { userId: string } }, @Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(req.user.userId, dto);
  }

  @Post('tour')
  tour(@Req() req: { user: { userId: string } }, @Body() dto: TourStateDto) {
    return this.onboarding.tour(req.user.userId, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/launch-readiness')
export class LaunchReadinessController {
  constructor(private readonly readiness: LaunchReadinessService) {}

  @Get()
  check(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    return this.readiness.check(organizationId, req.user.userId);
  }
}
