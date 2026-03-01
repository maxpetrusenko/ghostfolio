import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, HasPermission } from '@ghostfolio/common/permissions';
import { BrokerStatementService } from './broker-statement.service';
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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@ghostfolio/common/decorators';

@ApiTags('Broker Statement')
@Controller('broker-statement')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth()
export class BrokerStatementController {
  constructor(private readonly service: BrokerStatementService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @HasPermission('write')
  @ApiOperation({ summary: 'Upload and parse a broker statement' })
  async uploadStatement(
    @Body() dto: UploadStatementDto,
    @User() user: { id: string }
  ): Promise<ImportDetailsDto> {
    return this.service.uploadStatement(dto, user.id);
  }

  @Get('imports')
  @HasPermission('read')
  @ApiOperation({ summary: 'List all statement imports' })
  async listImports(
    @User() user: { id: string }
  ): Promise<BrokerStatementListDto> {
    return this.service.listImports(user.id);
  }

  @Get('imports/:id')
  @HasPermission('read')
  @ApiOperation({ summary: 'Get import details' })
  async getImportDetails(
    @Param('id') id: string,
    @User() user: { id: string }
  ): Promise<ImportDetailsDto> {
    return this.service.getImportDetails(id, user.id);
  }

  @Post('symbol-mappings')
  @HasPermission('write')
  @ApiOperation({ summary: 'Create or update a symbol mapping' })
  async setSymbolMapping(
    @Body() dto: SetSymbolMappingDto,
    @User() user: { id: string }
  ): Promise<SymbolMappingDto> {
    return this.service.setSymbolMapping(dto, user.id);
  }

  @Get('symbol-mappings')
  @HasPermission('read')
  @ApiOperation({ summary: 'List symbol mappings' })
  async listSymbolMappings(
    @User() user: { id: string }
  ): Promise<SymbolMappingListDto> {
    return this.service.listSymbolMappings(user.id);
  }

  @Delete('symbol-mappings/:id')
  @HasPermission('write')
  @ApiOperation({ summary: 'Delete a symbol mapping' })
  async deleteSymbolMapping(
    @Param('id') id: string,
    @User() user: { id: string }
  ): Promise<void> {
    return this.service.deleteSymbolMapping(id, user.id);
  }

  @Post('reconciliation/run')
  @HasPermission('write')
  @ApiOperation({ summary: 'Run reconciliation against Ghostfolio' })
  async runReconciliation(
    @Body() dto: RunReconciliationDto,
    @User() user: { id: string }
  ): Promise<ReconciliationSummaryDto> {
    return this.service.runReconciliation(dto, user.id);
  }

  @Get('reconciliation/:runId')
  @HasPermission('read')
  @ApiOperation({ summary: 'Get reconciliation results' })
  async getReconciliationResult(
    @Param('runId') runId: string,
    @User() user: { id: string }
  ): Promise<ReconciliationSummaryDto> {
    return this.service.getReconciliationResult(runId, user.id);
  }

  @Post('reconciliation/:runId/apply')
  @HasPermission('write')
  @ApiOperation({ summary: 'Apply a reconciliation fix' })
  async applyReconciliationFix(
    @Param('runId') runId: string,
    @Body() dto: ApplyReconciliationFixDto,
    @User() user: { id: string }
  ): Promise<void> {
    return this.service.applyReconciliationFix(runId, dto, user.id);
  }
}
