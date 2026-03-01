import {
  AiChatConversation,
  AiChatConversationsService
} from '@ghostfolio/client/services/ai-chat-conversations.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { permissions } from '@ghostfolio/common/permissions';
import { DataService } from '@ghostfolio/ui/services';

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import '@angular/localize/init';
import { of, throwError } from 'rxjs';

import { GfChatPageComponent } from './chat-page.component';

jest.mock('@ionic/angular/standalone', () => {
  return {
    IonIcon: class MockIonIcon {}
  };
});

describe('GfChatPageComponent', () => {
  let component: GfChatPageComponent;
  let aiChatConversationsService: jest.Mocked<AiChatConversationsService>;
  let dataService: jest.Mocked<DataService>;
  let userService: Pick<UserService, 'stateChanged'>;

  beforeEach(() => {
    const now = new Date();
    const conversation: AiChatConversation = {
      createdAt: now,
      id: 'conversation-1',
      messages: [],
      nextMessageId: 0,
      title: 'Conversation',
      updatedAt: now
    };

    aiChatConversationsService = {
      appendAssistantMessage: jest.fn(),
      appendUserMessage: jest.fn(),
      createConversation: jest.fn(() => conversation),
      deleteConversation: jest.fn(),
      getActiveConversationId: jest.fn(() => of(conversation.id)),
      getConversations: jest.fn(() => of([conversation])),
      getConversationsSnapshot: jest.fn(() => [conversation]),
      getCurrentConversation: jest.fn(() => of(conversation)),
      getCurrentConversationSnapshot: jest.fn(() => conversation),
      renameConversation: jest.fn(),
      selectConversation: jest.fn(() => true),
      setConversationSessionId: jest.fn(),
      updateMessage: jest.fn()
    } as unknown as jest.Mocked<AiChatConversationsService>;

    dataService = {
      postAiChat: jest.fn()
    } as unknown as jest.Mocked<DataService>;

    userService = {
      stateChanged: of({
        user: {
          permissions: [permissions.readAiPrompt]
        }
      })
    };

    component = new GfChatPageComponent(
      aiChatConversationsService,
      {
        detectChanges: jest.fn(),
        markForCheck: jest.fn()
      } as unknown as ChangeDetectorRef,
      dataService,
      {
        run: (fn: () => void) => fn()
      } as unknown as NgZone,
      userService as UserService
    );

    component.ngOnInit();
  });

  it('surfaces backend error code and message in chat failure UI', () => {
    dataService.postAiChat.mockReturnValue(
      throwError(() => {
        return new HttpErrorResponse({
          error: {
            code: 'AI_PROVIDER_NOT_CONFIGURED',
            message: 'No AI provider configured'
          },
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );

    component.query = 'How is my portfolio performing?';
    component.onSubmit();

    expect(component.errorMessage).toBe(
      'AI_PROVIDER_NOT_CONFIGURED: No AI provider configured'
    );
  });
});
