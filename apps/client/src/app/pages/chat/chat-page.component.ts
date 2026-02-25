import {
  AiChatConversation,
  AiChatConversationsService,
  AiChatMessage
} from '@ghostfolio/client/services/ai-chat-conversations.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { AiAgentChatResponse } from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  Info,
  LucideAngularModule,
  MessageSquare,
  MessageSquarePlus,
  SquarePen,
  Search,
  SendHorizontal,
  Check,
  X,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2
} from 'lucide-angular';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

interface ChatModelOption {
  id: string;
  label: string;
}

interface PendingSubmission {
  conversationId: string;
  nextResponsePreference?: string;
  query: string;
  requestedModelId: string;
  sessionId?: string;
}

@Component({
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    LucideAngularModule
  ],
  selector: 'gf-chat-page',
  styleUrls: ['./chat-page.component.scss'],
  templateUrl: './chat-page.component.html'
})
export class GfChatPageComponent implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild('chatLogContainer', { static: false })
  chatLogContainer: ElementRef<HTMLElement>;
  public readonly assistantRoleLabel = $localize`Assistant`;
  public activeResponseDetails: AiAgentChatResponse | undefined;
  public conversationSearchQuery = '';
  public conversations: AiChatConversation[] = [];
  public currentConversation: AiChatConversation | undefined;
  public errorMessage: string;
  public editingConversationId: string | undefined;
  public editingConversationTitle = '';
  public hasPermissionToReadAiPrompt = false;
  public isSubmitting = false;
  public readonly modelOptions: ChatModelOption[] = [
    {
      id: 'auto',
      label: $localize`Auto`
    },
    {
      id: 'glm',
      label: 'GLM-5'
    },
    {
      id: 'minimax',
      label: 'MiniMax-M2.5'
    },
    {
      id: 'openai',
      label: 'OpenAI'
    }
  ];
  public query = '';
  public nextResponsePreference = '';
  public selectedModelId = this.modelOptions[0].id;
  public readonly icons = {
    info: Info,
    messageSquare: MessageSquare,
    messageSquarePlus: MessageSquarePlus,
    pencil: SquarePen,
    check: Check,
    x: X,
    search: Search,
    sendHorizontal: SendHorizontal,
    sparkles: Sparkles,
    thumbsDown: ThumbsDown,
    thumbsUp: ThumbsUp,
    trash2: Trash2
  };
  public readonly starterPrompts = [
    $localize`Give me a portfolio risk summary.`,
    $localize`What are my top concentration risks right now?`,
    $localize`Show me the latest market prices for my top holdings.`
  ];
  public readonly userRoleLabel = $localize`You`;

  private activeSubmission: PendingSubmission | undefined;
  private pendingSubmissionQueue: PendingSubmission[] = [];
  private unsubscribeSubject = new Subject<void>();

  public constructor(
    private readonly aiChatConversationsService: AiChatConversationsService,
    private readonly dataService: DataService,
    private readonly userService: UserService
  ) {}

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((state) => {
        this.hasPermissionToReadAiPrompt = hasPermission(
          state?.user?.permissions,
          permissions.readAiPrompt
        );
      });

    this.aiChatConversationsService
      .getConversations()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((conversations) => {
        this.conversations = conversations;
      });

    this.aiChatConversationsService
      .getCurrentConversation()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((conversation) => {
        this.currentConversation = conversation;
        this.activeResponseDetails = undefined;
        this.scrollToBottom();
      });

    if (this.aiChatConversationsService.getConversationsSnapshot().length === 0) {
      this.aiChatConversationsService.createConversation();
    }
  }

  public ngAfterViewInit() {
    this.scrollToBottom();
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private scrollToBottom() {
    if (this.chatLogContainer) {
      const schedule =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (callback: FrameRequestCallback) => setTimeout(callback, 0);

      schedule(() => {
        const element = this.chatLogContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      });
    }
  }

  public get visibleMessages() {
    return this.currentConversation?.messages ?? [];
  }

  public get queueDepth() {
    return this.pendingSubmissionQueue.length + (this.activeSubmission ? 1 : 0);
  }

  public get isQueueBusy() {
    return this.queueDepth > 0;
  }

  public get filteredConversations() {
    const normalizedQuery = this.conversationSearchQuery
      .toLowerCase()
      .trim();

    if (!normalizedQuery) {
      return this.conversations;
    }

    return this.conversations.filter((conversation) => {
      return conversation.title.toLowerCase().includes(normalizedQuery);
    });
  }

  public get selectedModelLabel() {
    return (
      this.modelOptions.find(({ id }) => {
        return id === this.selectedModelId;
      })?.label ?? this.modelOptions[0].label
    );
  }

  public getRoleLabel(role: AiChatMessage['role']) {
    return role === 'assistant' ? this.assistantRoleLabel : this.userRoleLabel;
  }

  public onDeleteConversation(event: Event, conversationId: string) {
    event.stopPropagation();

    this.aiChatConversationsService.deleteConversation(conversationId);

    if (this.aiChatConversationsService.getConversationsSnapshot().length === 0) {
      this.aiChatConversationsService.createConversation();
    }
  }

  public onCancelRenameConversation(event: Event) {
    event.stopPropagation();
    this.resetRenameState();
  }

  private resetRenameState() {
    this.editingConversationId = undefined;
    this.editingConversationTitle = '';
  }

  public onRenameConversation(
    event: Event,
    conversationId: string,
    title: string,
    renameInput?: HTMLInputElement
  ) {
    event.stopPropagation();
    this.editingConversationId = conversationId;
    this.editingConversationTitle = title;
    this.focusConversationRenameInput(conversationId, renameInput);
  }

  private focusConversationRenameInput(
    conversationId: string,
    renameInput?: HTMLInputElement
  ) {
    setTimeout(() => {
      const input =
        renameInput ??
        document.querySelector<HTMLInputElement>(
          `.conversation-title-editor input[data-conversation-id="${conversationId}"]`
        );

      if (!input) {
        return;
      }

      input.focus();
      input.select();
    });
  }

  public onRenameConversationInputBlur(conversationId: string) {
    if (conversationId !== this.editingConversationId) {
      return;
    }

    if (document.activeElement?.closest('.conversation-title-editor')) {
      return;
    }

    this.onSaveConversationTitle(conversationId);
  }

  public onRenameConversationInputKeydown(
    event: KeyboardEvent,
    conversationId: string
  ) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onSaveConversationTitle(conversationId);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancelRenameConversation(event);
    }
  }

  public onSaveConversationTitle(conversationId: string, event?: Event) {
    event?.stopPropagation();
    const trimmedTitle = this.editingConversationTitle.trim();

    if (!trimmedTitle) {
      this.resetRenameState();
      return;
    }

    this.aiChatConversationsService.renameConversation({
      id: conversationId,
      title: trimmedTitle
    });
    this.resetRenameState();
  }

  public onNewChat() {
    this.errorMessage = undefined;
    this.query = '';
    this.nextResponsePreference = '';
    this.aiChatConversationsService.createConversation();
  }

  public onOpenResponseDetails(response?: AiAgentChatResponse) {
    this.activeResponseDetails = response;
  }

  public onRateResponse({
    messageId,
    rating
  }: {
    messageId: number;
    rating: 'down' | 'up';
  }) {
    const conversation = this.currentConversation;

    if (!conversation) {
      return;
    }

    const message = conversation.messages.find(({ id }) => {
      return id === messageId;
    });

    if (!message?.response?.memory?.sessionId) {
      return;
    }

    if (message.feedback?.isSubmitting || message.feedback?.rating) {
      return;
    }

    this.aiChatConversationsService.updateMessage({
      conversationId: conversation.id,
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
          this.aiChatConversationsService.updateMessage({
            conversationId: conversation.id,
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
          this.aiChatConversationsService.updateMessage({
            conversationId: conversation.id,
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
    const conversation = this.currentConversation;

    if (!conversation) {
      return;
    }

    this.aiChatConversationsService.updateMessage({
      conversationId: conversation.id,
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

  public onSelectConversation(conversationId: string) {
    this.errorMessage = undefined;
    this.query = '';
    this.nextResponsePreference = '';
    this.aiChatConversationsService.selectConversation(conversationId);
  }

  public onSelectStarterPrompt(prompt: string) {
    this.query = prompt;
  }

  public onSelectModel(modelId: string) {
    this.selectedModelId = modelId;
  }

  public onSubmit() {
    const activeConversation =
      this.aiChatConversationsService.getCurrentConversationSnapshot() ??
      this.currentConversation;

    const conversation =
      activeConversation ??
      this.aiChatConversationsService.createConversation();

    const normalizedQuery = this.query?.trim();
    const nextResponsePreference = this.nextResponsePreference?.trim();

    if (
      !this.hasPermissionToReadAiPrompt ||
      !normalizedQuery
    ) {
      return;
    }

    this.aiChatConversationsService.appendUserMessage({
      content: normalizedQuery,
      conversationId: conversation.id
    });

    this.pendingSubmissionQueue.push({
      conversationId: conversation.id,
      ...(nextResponsePreference ? { nextResponsePreference } : {}),
      query: normalizedQuery,
      requestedModelId: this.selectedModelId,
      sessionId: conversation.sessionId
    });

    this.errorMessage = undefined;
    this.query = '';
    this.nextResponsePreference = '';
    this.scrollToBottom();
    this.processSubmissionQueue();
  }

  private processSubmissionQueue() {
    if (this.isSubmitting) {
      return;
    }

    const submission = this.pendingSubmissionQueue.shift();

    if (!submission) {
      return;
    }

    this.isSubmitting = true;
    this.activeSubmission = submission;

    this.dataService
      .postAiChat({
        query: submission.query,
        conversationId: submission.conversationId,
        model:
          submission.requestedModelId === 'auto'
            ? undefined
            : submission.requestedModelId,
        ...(submission.nextResponsePreference
          ? { nextResponsePreference: submission.nextResponsePreference }
          : {}),
        sessionId: submission.sessionId
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.activeSubmission = undefined;
          this.scrollToBottom();
          this.processSubmissionQueue();
        }),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe({
        next: (response) => {
          this.aiChatConversationsService.setConversationSessionId({
            conversationId: submission.conversationId,
            sessionId: response.memory.sessionId
          });
          this.aiChatConversationsService.appendAssistantMessage({
            content: response.answer,
            conversationId: submission.conversationId,
            feedback: {
              isSubmitting: false
            },
            response
          });
          this.scrollToBottom();
        },
        error: () => {
          this.errorMessage = $localize`AI request failed. Check your model quota and permissions.`;

          this.aiChatConversationsService.appendAssistantMessage({
            content: $localize`Request failed. Please retry.`,
            conversationId: submission.conversationId
          });
          this.scrollToBottom();
        }
      });
  }

  public onSubmitFromKeyboard(event: KeyboardEvent) {
    if (!event.shiftKey) {
      this.onSubmit();
      event.preventDefault();
    }
  }

  public trackConversationById(
    _index: number,
    conversation: AiChatConversation
  ) {
    return conversation.id;
  }
}
