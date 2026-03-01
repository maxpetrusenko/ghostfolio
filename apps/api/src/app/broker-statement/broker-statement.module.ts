import { Module } from '@nestjs/common';
import { BrokerStatementController } from './broker-statement.controller';
import { BrokerStatementService } from './broker-statement.service';
import { BrokerStatementParserService } from './broker-statement-parser.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { OrderModule } from '@ghostfolio/api/app/order/order.module';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';
import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';

@Module({
  imports: [OrderModule, SymbolProfileModule, PortfolioModule],
  controllers: [BrokerStatementController],
  providers: [
    BrokerStatementService,
    BrokerStatementParserService,
    PrismaService
  ],
  exports: [BrokerStatementService, BrokerStatementParserService]
})
export class BrokerStatementModule {}
