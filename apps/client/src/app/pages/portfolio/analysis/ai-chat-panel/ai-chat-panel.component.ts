import { AiAgentChatResponse } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

interface AiChatFeedbackState {
  comment?: string;
  feedbackId?: string;
  isSubmitting: boolean;
  rating?: 'down' | 'up';
}

interface AiChatMessage {
  content: string;
  createdAt: Date;
  feedback?: AiChatFeedbackState;
  id: number;
  response?: AiAgentChatResponse;
  role: 'assistant' | 'user';
}

type StoredAiChatMessage = Omit<AiChatMessage, 'createdAt'> & {
  createdAt: string;
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule
  ],
  selector: 'gf-ai-chat-panel',
  styleUrls: ['./ai-chat-panel.component.scss'],
  templateUrl: './ai-chat-panel.component.html'
})
export class GfAiChatPanelComponent implements OnDestroy {
  private readonly STORAGE_KEY_MESSAGES = 'gf_ai_chat_messages';
  private readonly STORAGE_KEY_SESSION_ID = 'gf_ai_chat_session_id';
  private readonly MAX_STORED_MESSAGES = 200;

  @Input() hasPermissionToReadAiPrompt = false;
  @Output() chatCompleted = new EventEmitter<void>();

  public readonly assistantRoleLabel = $localize`Assistant`;
  public activeResponseDetails: AiAgentChatResponse | undefined;
  public chatMessages: AiChatMessage[] = [];
  public errorMessage: string;
  public isSubmitting = false;
  public query = '';
  public readonly starterPrompts = [
    $localize`How is my portfolio performing?`,
    $localize`Estimate my taxes for this year.`,
    $localize`Am I on track for FIRE?`,
    $localize`How can I make an order?`,
    $localize`Add test data for a quick check.`
  ];
  public readonly userRoleLabel = $localize`You`;

  private chatSessionId: string;
  private isDestroyed = false;
  private nextMessageId = 0;
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataService: DataService
  ) {
    this.restoreChatState();
  }

  public ngOnDestroy() {
    this.isDestroyed = true;
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  public onSelectStarterPrompt(prompt: string) {
    this.query = prompt;
  }

  public onRateResponse({
    messageId,
    rating
  }: {
    messageId: number;
    rating: 'down' | 'up';
  }) {
    const message = this.chatMessages.find(({ id }) => {
      return id === messageId;
    });

    if (!message?.response?.memory?.sessionId) {
      return;
    }

    if (message.feedback?.isSubmitting || message.feedback?.rating) {
      return;
    }

    this.updateMessage({
      messageId,
      updater: (currentMessage) => {
        return {
          ...currentMessage,
          feedback: {
            ...currentMessage.feedback,
            isSubmitting: true
          }
        };
      }
    });

    this.dataService
      .postAiChatFeedback({
        comment: message.feedback?.comment?.trim() || undefined,
        rating,
        sessionId: message.response.memory.sessionId
      })
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe({
        next: ({ feedbackId }) => {
          this.updateMessage({
            messageId,
            updater: (currentMessage) => {
              return {
                ...currentMessage,
                feedback: {
                  feedbackId,
                  isSubmitting: false,
                  rating
                }
              };
            }
          });
        },
        error: () => {
          this.updateMessage({
            messageId,
            updater: (currentMessage) => {
              return {
                ...currentMessage,
                feedback: {
                  ...currentMessage.feedback,
                  isSubmitting: false
                }
              };
            }
          });
        }
      });
  }

  public onFeedbackCommentChange({
    comment,
    messageId
  }: {
    comment: string;
    messageId: number;
  }) {
    this.updateMessage({
      messageId,
      updater: (currentMessage) => {
        return {
          ...currentMessage,
          feedback: {
            ...currentMessage.feedback,
            comment
          }
        };
      }
    });
  }

  public onSubmitFromKeyboard(event: KeyboardEvent) {
    if (!event.shiftKey) {
      this.onSubmit();
      event.preventDefault();
    }
  }

  public onOpenResponseDetails(response?: AiAgentChatResponse) {
    this.activeResponseDetails = response;
  }

  public onSubmit() {
    const normalizedQuery = this.query?.trim();
    if (
      !this.hasPermissionToReadAiPrompt ||
      this.isSubmitting ||
      !normalizedQuery
    ) {
      return;
    }

    this.appendMessage({
      content: normalizedQuery,
      createdAt: new Date(),
      id: this.nextMessageId++,
      role: 'user'
    });
    this.errorMessage = undefined;
    this.isSubmitting = true;
    this.query = '';

    this.dataService
      .postAiChat({
        query: normalizedQuery,
        sessionId: this.chatSessionId
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.requestViewUpdate();
        }),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe({
        next: (response) => {
          this.chatSessionId = response.memory.sessionId;
          this.appendMessage({
            content: response.answer,
            createdAt: new Date(),
            feedback: {
              isSubmitting: false
            },
            id: this.nextMessageId++,
            response,
            role: 'assistant'
          });
          this.chatCompleted.emit();
          this.requestViewUpdate();
        },
        error: (error: unknown) => {
          const { code, message } = this.extractBackendError(error);
          this.errorMessage = code ? `${code}: ${message}` : message;
          this.appendMessage({
            content: code
              ? `Request failed (${code}: ${message}). Please retry.`
              : `Request failed (${message}). Please retry.`,
            createdAt: new Date(),
            id: this.nextMessageId++,
            role: 'assistant'
          });

          this.requestViewUpdate();
        }
      });
  }

  public getRoleLabel(role: AiChatMessage['role']) {
    return role === 'assistant' ? this.assistantRoleLabel : this.userRoleLabel;
  }

  public get visibleMessages() {
    return [...this.chatMessages].reverse();
  }

  private appendMessage(message: AiChatMessage) {
    this.chatMessages = [...this.chatMessages, message].slice(
      -this.MAX_STORED_MESSAGES
    );
    this.persistChatState();
  }

  private getStorage() {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  }

  private persistChatState() {
    const storage = this.getStorage();

    if (!storage) {
      return;
    }

    try {
      if (this.chatSessionId) {
        storage.setItem(this.STORAGE_KEY_SESSION_ID, this.chatSessionId);
      } else {
        storage.removeItem(this.STORAGE_KEY_SESSION_ID);
      }

      storage.setItem(
        this.STORAGE_KEY_MESSAGES,
        JSON.stringify(this.chatMessages.slice(-this.MAX_STORED_MESSAGES))
      );
    } catch {
      // Keep chat available if browser storage is unavailable or full.
    }
  }

  private restoreChatState() {
    const storage = this.getStorage();

    if (!storage) {
      return;
    }

    const storedSessionId = storage.getItem(this.STORAGE_KEY_SESSION_ID);

    if (storedSessionId?.trim()) {
      this.chatSessionId = storedSessionId.trim();
    }

    const storedMessages = storage.getItem(this.STORAGE_KEY_MESSAGES);

    if (!storedMessages) {
      return;
    }

    try {
      const parsedMessages = JSON.parse(storedMessages) as unknown;

      if (!Array.isArray(parsedMessages)) {
        return;
      }

      this.chatMessages = parsedMessages
        .map((message) => {
          return this.toChatMessage(message);
        })
        .filter((message): message is AiChatMessage => {
          return Boolean(message);
        })
        .slice(-this.MAX_STORED_MESSAGES);

      this.nextMessageId =
        this.chatMessages.reduce((maxId, message) => {
          return Math.max(maxId, message.id);
        }, -1) + 1;
    } catch {
      storage.removeItem(this.STORAGE_KEY_MESSAGES);
    }
  }

  private toChatMessage(message: unknown): AiChatMessage | undefined {
    if (!message || typeof message !== 'object') {
      return undefined;
    }

    const storedMessage = message as Partial<StoredAiChatMessage>;

    if (
      typeof storedMessage.content !== 'string' ||
      typeof storedMessage.id !== 'number' ||
      typeof storedMessage.createdAt !== 'string' ||
      (storedMessage.role !== 'assistant' && storedMessage.role !== 'user')
    ) {
      return undefined;
    }

    const createdAt = new Date(storedMessage.createdAt);

    if (Number.isNaN(createdAt.getTime())) {
      return undefined;
    }

    return {
      content: storedMessage.content,
      createdAt,
      feedback: storedMessage.feedback,
      id: storedMessage.id,
      response: storedMessage.response,
      role: storedMessage.role
    };
  }

  private updateMessage({
    messageId,
    updater
  }: {
    messageId: number;
    updater: (message: AiChatMessage) => AiChatMessage;
  }) {
    let hasUpdatedMessage = false;

    this.chatMessages = this.chatMessages.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      hasUpdatedMessage = true;
      return updater(message);
    });

    if (!hasUpdatedMessage) {
      return;
    }

    this.persistChatState();
    this.requestViewUpdate();
  }

  private requestViewUpdate() {
    if (this.isDestroyed) {
      return;
    }

    this.changeDetectorRef.markForCheck();
    this.changeDetectorRef.detectChanges();
  }

  private extractBackendError(error: unknown): {
    code?: string;
    message: string;
  } {
    if (error instanceof HttpErrorResponse) {
      const payload = error.error;
      const code =
        payload && typeof payload === 'object' && 'code' in payload
          ? String(payload.code)
          : undefined;
      const payloadMessage =
        payload && typeof payload === 'object' && 'message' in payload
          ? Array.isArray(payload.message)
            ? payload.message.join(', ')
            : String(payload.message)
          : undefined;

      return {
        ...(code ? { code } : {}),
        message:
          payloadMessage?.trim() ||
          error.message ||
          $localize`AI request failed. Check your model quota and permissions.`
      };
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return { message: error.message };
    }

    return {
      message: $localize`AI request failed. Check your model quota and permissions.`
    };
  }
}
