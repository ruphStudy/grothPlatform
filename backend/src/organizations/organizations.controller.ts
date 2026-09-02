import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Req() req: { user: { userId: string } }) {
    return this.organizationsService.findAllByOwner(req.user.userId);
  }

  @Get(':id')
  findOne(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.organizationsService.findOneOwned(id, req.user.userId);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, req.user.userId, dto);
  }
}
