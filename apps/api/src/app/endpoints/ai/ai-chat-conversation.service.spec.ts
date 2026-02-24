import { NotFoundException } from '@nestjs/common';

import { AiChatConversationService } from './ai-chat-conversation.service';

describe('AiChatConversationService', () => {
  let prismaService: {
    $transaction: jest.Mock;
    chatConversation: {
      count: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    chatMessage: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let subject: AiChatConversationService;

  beforeEach(() => {
    prismaService = {
      $transaction: jest.fn(),
      chatConversation: {
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn()
      }
    };

    subject = new AiChatConversationService(prismaService as never);
  });

  it('resolves chat session from conversation memory first', async () => {
    prismaService.chatConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      memorySessionId: 'memory-session-1'
    });

    const result = await subject.resolveChatContext({
      conversationId: 'conversation-1',
      sessionId: 'legacy-session-1',
      userId: 'user-1'
    });

    expect(result).toEqual({
      conversationId: 'conversation-1',
      resolvedSessionId: 'memory-session-1'
    });
  });

  it('keeps legacy behavior when conversation id is absent', async () => {
    const result = await subject.resolveChatContext({
      sessionId: 'legacy-session-1',
      userId: 'user-1'
    });

    expect(result).toEqual({
      conversationId: undefined,
      resolvedSessionId: 'legacy-session-1'
    });
    expect(prismaService.chatConversation.findFirst).not.toHaveBeenCalled();
  });

  it('rejects cross-user access for unknown conversation id', async () => {
    prismaService.chatConversation.findFirst.mockResolvedValue(undefined);

    await expect(
      subject.resolveChatContext({
        conversationId: 'conversation-1',
        userId: 'user-1'
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists conversations with count, pagination, and last message metadata', async () => {
    const conversationRecord = {
      _count: { messages: 1 },
      createdAt: new Date('2026-02-24T10:00:00.000Z'),
      id: 'conversation-1',
      memorySessionId: 'memory-session-1',
      messages: [
        {
          content: 'Latest assistant answer',
          createdAt: new Date('2026-02-24T10:02:00.000Z'),
          role: 'ASSISTANT'
        }
      ],
      title: 'Risk review',
      updatedAt: new Date('2026-02-24T10:02:00.000Z')
    };

    prismaService.$transaction.mockResolvedValue([1, [conversationRecord]]);

    const result = await subject.listConversations({
      query: 'risk',
      skip: '0',
      take: '25',
      userId: 'user-1'
    });

    expect(prismaService.$transaction).toHaveBeenCalled();
    expect(result).toEqual({
      conversations: [
        {
          createdAt: new Date('2026-02-24T10:00:00.000Z'),
          id: 'conversation-1',
          lastMessage: {
            content: 'Latest assistant answer',
            createdAt: new Date('2026-02-24T10:02:00.000Z'),
            role: 'assistant'
          },
          memorySessionId: 'memory-session-1',
          messagesCount: 1,
          title: 'Risk review',
          updatedAt: new Date('2026-02-24T10:02:00.000Z')
        }
      ],
      count: 1
    });
  });

  it('persists user and assistant messages with monotonic sequence and memory mapping', async () => {
    prismaService.chatConversation.findFirst.mockResolvedValue({
      id: 'conversation-1',
      memorySessionId: undefined,
      messages: [{ sequence: 3 }]
    });
    prismaService.chatMessage.create
      .mockResolvedValueOnce({
        id: 'message-4'
      })
      .mockResolvedValueOnce({
        id: 'message-5'
      });
    prismaService.chatConversation.update.mockResolvedValue({
      id: 'conversation-1'
    });
    prismaService.$transaction.mockResolvedValue([
      { id: 'message-4' },
      { id: 'message-5' },
      { id: 'conversation-1' }
    ]);

    await subject.persistChatExchange({
      conversationId: 'conversation-1',
      query: 'How should I rebalance?',
      response: {
        answer: 'Reduce concentration and diversify into lower correlated assets.',
        citations: [],
        confidence: { band: 'medium', score: 0.7 },
        memory: { sessionId: 'memory-session-1', turns: 4 },
        toolCalls: [],
        verification: []
      },
      userId: 'user-1'
    });

    expect(prismaService.chatMessage.create).toHaveBeenNthCalledWith(1, {
      data: {
        content: 'How should I rebalance?',
        conversationId: 'conversation-1',
        role: 'USER',
        sequence: 4
      }
    });
    expect(prismaService.chatMessage.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          content:
            'Reduce concentration and diversify into lower correlated assets.',
          conversationId: 'conversation-1',
          role: 'ASSISTANT',
          sequence: 5
        })
      })
    );
    expect(prismaService.chatConversation.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memorySessionId: 'memory-session-1',
        updatedAt: expect.any(Date)
      }),
      where: {
        id: 'conversation-1'
      }
    });
  });
});
