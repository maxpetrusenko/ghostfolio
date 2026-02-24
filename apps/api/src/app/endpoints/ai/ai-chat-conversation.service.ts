import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  AiAgentChatResponse,
  AiChatConversationMessage,
  AiChatConversationMessagesResponse,
  AiChatConversationResponse,
  AiChatConversationsResponse,
  AiChatConversationSummary
} from '@ghostfolio/common/interfaces';

import {
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  ChatMessageRole,
  Prisma
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const DEFAULT_LIST_TAKE = 20;
const DEFAULT_MESSAGE_TAKE = 50;
const MAX_TAKE = 100;
const DEFAULT_CONVERSATION_TITLE = 'New Chat';

@Injectable()
export class AiChatConversationService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async createConversation({
    title,
    userId
  }: {
    title?: string;
    userId: string;
  }): Promise<AiChatConversationResponse> {
    const conversation = await this.prismaService.chatConversation.create({
      data: {
        title: this.normalizeTitle(title),
        userId
      }
    });

    return {
      conversation: this.toConversationSummary({
        ...conversation,
        _count: { messages: 0 },
        messages: []
      })
    };
  }

  public async deleteConversation({
    conversationId,
    userId
  }: {
    conversationId: string;
    userId: string;
  }) {
    const { count } = await this.prismaService.chatConversation.deleteMany({
      where: {
        id: conversationId,
        userId
      }
    });

    if (count === 0) {
      throw new NotFoundException('Conversation not found');
    }

    return { deleted: true };
  }

  public async getConversationMessages({
    conversationId,
    skip,
    take,
    userId
  }: {
    conversationId: string;
    skip?: string;
    take?: string;
    userId: string;
  }): Promise<AiChatConversationMessagesResponse> {
    const normalizedSkip = this.normalizeSkip(skip);
    const normalizedTake = this.normalizeTake(take, DEFAULT_MESSAGE_TAKE);
    const conversation = await this.prismaService.chatConversation.findFirst({
      where: {
        id: conversationId,
        userId
      },
      include: {
        _count: {
          select: {
            messages: true
          }
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = await this.prismaService.chatMessage.findMany({
      orderBy: [{ sequence: 'desc' }],
      skip: normalizedSkip,
      take: normalizedTake,
      where: {
        conversationId
      }
    });

    return {
      conversation: this.toConversationSummary({
        ...conversation,
        messages: []
      }),
      count: conversation._count.messages,
      messages: messages.map((message) => {
        return this.toConversationMessage(message);
      })
    };
  }

  public async listConversations({
    query,
    skip,
    take,
    userId
  }: {
    query?: string;
    skip?: string;
    take?: string;
    userId: string;
  }): Promise<AiChatConversationsResponse> {
    const normalizedSkip = this.normalizeSkip(skip);
    const normalizedTake = this.normalizeTake(take, DEFAULT_LIST_TAKE);
    const normalizedQuery = query?.trim();
    const where: Prisma.ChatConversationWhereInput = {
      userId
    };

    if (normalizedQuery) {
      where.title = {
        contains: normalizedQuery,
        mode: 'insensitive'
      };
    }

    const [count, conversations] = await this.prismaService.$transaction([
      this.prismaService.chatConversation.count({
        where
      }),
      this.prismaService.chatConversation.findMany({
        include: {
          _count: {
            select: {
              messages: true
            }
          },
          messages: {
            orderBy: [{ sequence: 'desc' }],
            select: {
              content: true,
              createdAt: true,
              role: true
            },
            take: 1
          }
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip: normalizedSkip,
        take: normalizedTake,
        where
      })
    ]);

    return {
      conversations: conversations.map((conversation) => {
        return this.toConversationSummary(conversation);
      }),
      count
    };
  }

  public async persistChatExchange({
    conversationId,
    query,
    response,
    userId
  }: {
    conversationId: string;
    query: string;
    response: AiAgentChatResponse;
    userId: string;
  }) {
    const conversation = await this.prismaService.chatConversation.findFirst({
      include: {
        messages: {
          orderBy: [{ sequence: 'desc' }],
          select: {
            sequence: true
          },
          take: 1
        }
      },
      where: {
        id: conversationId,
        userId
      }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const currentSequence = conversation.messages[0]?.sequence ?? -1;
    const conversationUpdateData: Prisma.ChatConversationUpdateInput = {
      updatedAt: new Date()
    };

    if (!conversation.memorySessionId) {
      conversationUpdateData.memorySessionId = response.memory.sessionId;
    }

    await this.prismaService.$transaction([
      this.prismaService.chatMessage.create({
        data: {
          content: query,
          conversationId,
          role: ChatMessageRole.USER,
          sequence: currentSequence + 1
        }
      }),
      this.prismaService.chatMessage.create({
        data: {
          content: response.answer,
          conversationId,
          response: response as unknown as Prisma.InputJsonValue,
          role: ChatMessageRole.ASSISTANT,
          sequence: currentSequence + 2
        }
      }),
      this.prismaService.chatConversation.update({
        data: conversationUpdateData,
        where: {
          id: conversationId
        }
      })
    ]);
  }

  public async resolveChatContext({
    conversationId,
    sessionId,
    userId
  }: {
    conversationId?: string;
    sessionId?: string;
    userId: string;
  }) {
    const normalizedSessionId = sessionId?.trim();

    if (!conversationId) {
      return {
        conversationId: undefined,
        resolvedSessionId: normalizedSessionId || randomUUID()
      };
    }

    const conversation = await this.prismaService.chatConversation.findFirst({
      select: {
        id: true,
        memorySessionId: true
      },
      where: {
        id: conversationId,
        userId
      }
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      conversationId: conversation.id,
      resolvedSessionId:
        conversation.memorySessionId?.trim() || normalizedSessionId || randomUUID()
    };
  }

  public async updateConversationTitle({
    conversationId,
    title,
    userId
  }: {
    conversationId: string;
    title: string;
    userId: string;
  }): Promise<AiChatConversationResponse> {
    const existingConversation = await this.prismaService.chatConversation.findFirst({
      include: {
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          orderBy: [{ sequence: 'desc' }],
          select: {
            content: true,
            createdAt: true,
            role: true
          },
          take: 1
        }
      },
      where: {
        id: conversationId,
        userId
      }
    });

    if (!existingConversation) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = await this.prismaService.chatConversation.update({
      data: {
        title: this.normalizeTitle(title),
        updatedAt: new Date()
      },
      include: {
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          orderBy: [{ sequence: 'desc' }],
          select: {
            content: true,
            createdAt: true,
            role: true
          },
          take: 1
        }
      },
      where: {
        id: existingConversation.id
      }
    });

    return {
      conversation: this.toConversationSummary(conversation)
    };
  }

  private normalizeSkip(skip?: string) {
    const parsedSkip = Number.parseInt(skip ?? '', 10);

    if (Number.isNaN(parsedSkip) || parsedSkip < 0) {
      return 0;
    }

    return parsedSkip;
  }

  private normalizeTake(take: string | undefined, defaultTake: number) {
    const parsedTake = Number.parseInt(take ?? '', 10);

    if (Number.isNaN(parsedTake) || parsedTake < 1) {
      return defaultTake;
    }

    return Math.min(parsedTake, MAX_TAKE);
  }

  private normalizeTitle(title?: string) {
    return title?.trim() || DEFAULT_CONVERSATION_TITLE;
  }

  private toConversationMessage(message: {
    content: string;
    conversationId: string;
    createdAt: Date;
    id: string;
    response: Prisma.JsonValue | null;
    role: ChatMessageRole;
    sequence: number;
  }): AiChatConversationMessage {
    return {
      content: message.content,
      conversationId: message.conversationId,
      createdAt: message.createdAt,
      id: message.id,
      response: message.response as unknown as AiAgentChatResponse | undefined,
      role: this.toRole(message.role),
      sequence: message.sequence
    };
  }

  private toConversationSummary(conversation: {
    createdAt: Date;
    id: string;
    memorySessionId: string | null;
    messages: {
      content: string;
      createdAt: Date;
      role: ChatMessageRole;
    }[];
    title: string;
    updatedAt: Date;
    _count: {
      messages: number;
    };
  }): AiChatConversationSummary {
    const lastMessage = conversation.messages[0];

    return {
      createdAt: conversation.createdAt,
      id: conversation.id,
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            role: this.toRole(lastMessage.role)
          }
        : undefined,
      memorySessionId: conversation.memorySessionId || undefined,
      messagesCount: conversation._count.messages,
      title: conversation.title,
      updatedAt: conversation.updatedAt
    };
  }

  private toRole(role: ChatMessageRole) {
    return role === ChatMessageRole.ASSISTANT ? 'assistant' : 'user';
  }
}
