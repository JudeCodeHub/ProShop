import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../generated/prisma/client.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService, toSettingsResponse } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(Role.cashier, Role.admin)
  async get() {
    return toSettingsResponse(await this.settingsService.get());
  }

  @Put()
  @Roles(Role.admin)
  async update(@Body() dto: UpdateSettingsDto) {
    return toSettingsResponse(await this.settingsService.update(dto));
  }
}
