import { Controller, Get, Param, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'SUPERVISOR')
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  /** LGPD art. 18 (acesso e portabilidade): o titular baixa todos os seus dados. */
  @Get('me/data')
  exportMyData(@CurrentUser('id') userId: string) {
    return this.usersService.exportMyData(userId);
  }

  @Get('agents')
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  getAgents() {
    return this.usersService.getAgents();
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  updateStatus(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.usersService.updateStatus(id, isActive);
  }
}
