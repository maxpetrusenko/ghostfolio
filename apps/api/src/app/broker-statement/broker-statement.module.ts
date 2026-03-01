import { OrderModule } from '@ghostfolio/api/app/order/order.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';

import { Module } from '@nestjs/common';

import { BrokerStatementParserService } from './broker-statement-parser.service';
import { BrokerStatementController } from './broker-statement.controller';
import { BrokerStatementService } from './broker-statement.service';

@Module({
  imports: [OrderModule, PrismaModule, SymbolProfileModule],
  controllers: [BrokerStatementController],
  providers: [BrokerStatementService, BrokerStatementParserService],
  exports: [BrokerStatementService, BrokerStatementParserService]
})
export class BrokerStatementModule {}
