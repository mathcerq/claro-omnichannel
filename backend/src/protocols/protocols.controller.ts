import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProtocolsService } from './protocols.service';
import { CreateProtocolDto } from './dto/create-protocol.dto';
import { UpdateProtocolDto, AssignAgentDto } from './dto/update-protocol.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('protocols')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProtocolsController {
  constructor(private protocolsService: ProtocolsService) {}

  @Post()
  @Roles('CLIENT')
  create(@CurrentUser() user: any, @Body() dto: CreateProtocolDto) {
    return this.protocolsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.protocolsService.findAll(user);
  }

  @Get('stats')
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  getStats() {
    return this.protocolsService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.protocolsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  update(@Param('id') id: string, @Body() dto: UpdateProtocolDto, @CurrentUser() user: any) {
    return this.protocolsService.update(id, dto, user);
  }

  @Patch(':id/assign')
  @Roles('ADMIN', 'SUPERVISOR', 'AGENT')
  assignAgent(
    @Param('id') protocolId: string,
    @Body() dto: AssignAgentDto,
    @CurrentUser() user: any,
  ) {
    const targetAgentId = dto.agentId || user.id;
    return this.protocolsService.assignAgent(protocolId, targetAgentId, user);
  }
}
