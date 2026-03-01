import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ApiService } from '@ghostfolio/api/services/api/api.service';
import { AiPromptResponse } from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { AiPromptMode, RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import {
  AiAgentChatResponse,
  AiAgentFeedbackResponse
} from './ai-agent.interfaces';
import { AiChatFeedbackDto } from './ai-chat-feedback.dto';
import { AiChatDto } from './ai-chat.dto';
import { AiFeedbackService } from './ai-feedback.service';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  public constructor(
    private readonly aiFeedbackService: AiFeedbackService,
    private readonly aiService: AiService,
    private readonly apiService: ApiService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  @Get('prompt/:mode')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async getPrompt(
    @Param('mode') mode: AiPromptMode,
    @Query('accounts') filterByAccounts?: string,
    @Query('assetClasses') filterByAssetClasses?: string,
    @Query('dataSource') filterByDataSource?: string,
    @Query('symbol') filterBySymbol?: string,
    @Query('tags') filterByTags?: string
  ): Promise<AiPromptResponse> {
    const filters = this.apiService.buildFiltersFromQueryParams({
      filterByAccounts,
      filterByAssetClasses,
      filterByDataSource,
      filterBySymbol,
      filterByTags
    });

    const prompt = await this.aiService.getPrompt({
      filters,
      mode,
      impersonationId: undefined,
      languageCode: this.request.user.settings.settings.language,
      userCurrency: this.request.user.settings.settings.baseCurrency,
      userId: this.request.user.id
    });

    return { prompt };
  }

  @Post('chat')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async chat(@Body() data: AiChatDto): Promise<AiAgentChatResponse> {
    const requestPayload = {
      languageCode: this.request.user.settings.settings.language,
      query: data.query,
      ...(data.model ? { model: data.model } : {}),
      ...(data.nextResponsePreference
        ? { nextResponsePreference: data.nextResponsePreference }
        : {}),
      ...(data.conversationId ? { conversationId: data.conversationId } : {}),
      sessionId: data.sessionId,
      symbols: data.symbols,
      userCurrency: this.request.user.settings.settings.baseCurrency,
      userId: this.request.user.id
    };

    try {
      return await this.aiService.run(requestPayload);
    } catch (error) {
      throw this.mapAiChatErrorToHttpException(error);
    }
  }

  @Post('chat/feedback')
  @HasPermission(permissions.readAiPrompt)
  @UseGuards(AuthGuard('jwt'), HasPermissionGuard)
  public async submitFeedback(
    @Body() data: AiChatFeedbackDto
  ): Promise<AiAgentFeedbackResponse> {
    return this.aiFeedbackService.submitFeedback({
      comment: data.comment,
      rating: data.rating,
      sessionId: data.sessionId,
      userId: this.request.user.id
    });
  }

  private mapAiChatErrorToHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'AI chat failed';
    const traceId = this.getStringMetadata(error, 'traceId');
    const sessionId = this.getStringMetadata(error, 'sessionId');

    if (message.includes('No AI provider configured')) {
      return new ServiceUnavailableException({
        ...(sessionId ? { sessionId } : {}),
        ...(traceId ? { traceId } : {}),
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        message,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE
      });
    }

    return new InternalServerErrorException({
      ...(sessionId ? { sessionId } : {}),
      ...(traceId ? { traceId } : {}),
      code: 'AI_CHAT_RUNTIME_ERROR',
      message,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR
    });
  }

  private getStringMetadata(error: unknown, key: 'sessionId' | 'traceId') {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }
}
