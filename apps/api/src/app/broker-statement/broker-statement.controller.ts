import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { permissions } from '@ghostfolio/common/permissions';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import {
  UploadStatementDto,
  SetSymbolMappingDto,
  RunReconciliationDto,
  ApplyReconciliationFixDto,
  ImportDetailsDto,
  SymbolMappingDto,
  ReconciliationSummaryDto,
  BrokerStatementListDto,
  SymbolMappingListDto
} from './broker-statement.dto';
import { BrokerStatementService } from './broker-statement.service';

@Controller('broker-statement')
@UseGuards(AuthGuard('jwt'), HasPermissionGuard)
export class BrokerStatementController {
  constructor(
    private readonly service: BrokerStatementService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @HasPermission(permissions.createOrder)
  async uploadStatement(
    @Body() dto: UploadStatementDto
  ): Promise<ImportDetailsDto> {
    return this.service.uploadStatement(dto, this.request.user.id);
  }

  @Get('imports')
  @HasPermission(permissions.updateAccount)
  async listImports(): Promise<BrokerStatementListDto> {
    return this.service.listImports(this.request.user.id);
  }

  @Get('imports/:id')
  @HasPermission(permissions.updateAccount)
  async getImportDetails(@Param('id') id: string): Promise<ImportDetailsDto> {
    return this.service.getImportDetails(id, this.request.user.id);
  }

  @Post('symbol-mappings')
  @HasPermission(permissions.updateAccount)
  async setSymbolMapping(
    @Body() dto: SetSymbolMappingDto
  ): Promise<SymbolMappingDto> {
    return this.service.setSymbolMapping(dto, this.request.user.id);
  }

  @Get('symbol-mappings')
  @HasPermission(permissions.updateAccount)
  async listSymbolMappings(): Promise<SymbolMappingListDto> {
    return this.service.listSymbolMappings(this.request.user.id);
  }

  @Delete('symbol-mappings/:id')
  @HasPermission(permissions.updateAccount)
  async deleteSymbolMapping(@Param('id') id: string): Promise<void> {
    return this.service.deleteSymbolMapping(id, this.request.user.id);
  }

  @Post('reconciliation/run')
  @HasPermission(permissions.updateAccount)
  async runReconciliation(
    @Body() dto: RunReconciliationDto
  ): Promise<ReconciliationSummaryDto> {
    return this.service.runReconciliation(dto, this.request.user.id);
  }

  @Get('reconciliation/:runId')
  @HasPermission(permissions.updateAccount)
  async getReconciliationResult(
    @Param('runId') runId: string
  ): Promise<ReconciliationSummaryDto> {
    return this.service.getReconciliationResult(runId, this.request.user.id);
  }

  @Post('reconciliation/:runId/apply')
  @HasPermission(permissions.createOrder)
  async applyReconciliationFix(
    @Param('runId') runId: string,
    @Body() dto: ApplyReconciliationFixDto
  ): Promise<void> {
    return this.service.applyReconciliationFix(
      runId,
      dto,
      this.request.user.id
    );
  }
}
