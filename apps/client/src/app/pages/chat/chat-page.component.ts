import {
  AiChatConversation,
  AiChatConversationsService,
  AiChatMessage
} from '@ghostfolio/client/services/ai-chat-conversations.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { AiAgentChatResponse } from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { DataService } from '@ghostfolio/ui/services';

import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
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
  query: string;
  requestedModelId: string;
  sessionId?: string;
}

interface RenderedAssistantMessage {
  displayContent: string;
  actions: string[];
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
  public showNewMessageButton = false;
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
      id: 'chatgpt',
      label: 'ChatGPT'
    },
    {
      id: 'glm',
      label: 'GLM-5'
    },
    {
      id: 'minimax',
      label: 'MiniMax-M2.5'
    }
  ];
  public query = '';
  public selectedModelId = 'auto';
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
    $localize`How is my portfolio performing?`,
    $localize`Estimate my taxes for this year.`,
    $localize`Am I on track for FIRE?`,
    $localize`How can I make an order?`,
    $localize`Add test data for a quick check.`
  ];
  public readonly userRoleLabel = $localize`You`;

  private activeSubmission: PendingSubmission | undefined;
  private pendingSubmissionQueue: PendingSubmission[] = [];
  private unsubscribeSubject = new Subject<void>();
  private renderedAssistantMessageMap = new WeakMap<
    AiChatMessage,
    RenderedAssistantMessage
  >();
  private shouldAutoScrollToBottom = true;

  public constructor(
    private readonly aiChatConversationsService: AiChatConversationsService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataService: DataService,
    private readonly ngZone: NgZone,
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
        this.markViewForUpdate();
      });

    this.aiChatConversationsService
      .getCurrentConversation()
      .pipe(takeUntil(this.unsubscribeSubject))
      .subscribe((conversation) => {
        this.currentConversation = conversation;
        this.activeResponseDetails = undefined;
        this.shouldAutoScrollToBottom = true;
        this.showNewMessageButton = false;
        this.renderedAssistantMessageMap = new WeakMap<
          AiChatMessage,
          RenderedAssistantMessage
        >();
        this.scrollToBottom(true);
        this.markViewForUpdate();
      });

    if (
      this.aiChatConversationsService.getConversationsSnapshot().length === 0
    ) {
      this.aiChatConversationsService.createConversation();
    }
  }

  public ngAfterViewInit() {
    this.scrollToBottom(true);
  }

  public ngOnDestroy() {
    this.unsubscribeSubject.next();
    this.unsubscribeSubject.complete();
  }

  private scrollToBottom(force = false) {
    const element = this.chatLogContainer?.nativeElement;

    if (!element || (!force && !this.shouldAutoScrollToBottom)) {
      return;
    }

    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => setTimeout(callback, 0);

    schedule(() => {
      element.scrollTop = element.scrollHeight;
      this.showNewMessageButton = false;
    });

    this.shouldAutoScrollToBottom = true;
  }

  public onChatLogScroll() {
    const element = this.chatLogContainer?.nativeElement;

    if (!element) {
      return;
    }

    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    this.shouldAutoScrollToBottom = nearBottom;
    this.showNewMessageButton = !nearBottom;
  }

  public onScrollToBottom() {
    this.scrollToBottom(true);
  }

  public get visibleMessages() {
    return [...(this.currentConversation?.messages ?? [])];
  }

  private markViewForUpdate() {
    this.ngZone.run(() => {
      this.changeDetectorRef.markForCheck();
    });
  }

  public getAssistantRenderedMessage(message: AiChatMessage) {
    if (message.role !== 'assistant') {
      return undefined;
    }

    const cached = this.renderedAssistantMessageMap.get(message);

    if (cached) {
      return cached;
    }

    const rendered = this.renderAssistantMessage(message.content);
    this.renderedAssistantMessageMap.set(message, rendered);

    return rendered;
  }

  public get queueDepth() {
    return this.pendingSubmissionQueue.length + (this.activeSubmission ? 1 : 0);
  }

  public get isQueueBusy() {
    return this.queueDepth > 0;
  }

  public get filteredConversations() {
    const normalizedQuery = this.conversationSearchQuery.toLowerCase().trim();

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

  public formatToolCallDuration(durationInMs?: number): string {
    if (
      durationInMs === undefined ||
      !Number.isFinite(durationInMs) ||
      durationInMs < 0
    ) {
      return 'n/a';
    }

    if (durationInMs >= 1000) {
      return `${(durationInMs / 1000).toFixed(durationInMs >= 10000 ? 0 : 1)}s`;
    }

    return `${Math.round(durationInMs)}ms`;
  }

  public onDeleteConversation(event: Event, conversationId: string) {
    event.stopPropagation();

    this.aiChatConversationsService.deleteConversation(conversationId);

    if (
      this.aiChatConversationsService.getConversationsSnapshot().length === 0
    ) {
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
    this.aiChatConversationsService.createConversation();
  }

  public getConfidenceBandClass(band: string) {
    return `assistant-confidence-${band}`;
  }

  private renderAssistantMessage(content: string): RenderedAssistantMessage {
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const actions: string[] = [];
    const contentLines: string[] = [];
    const hasStructuredHeader = lines.some((line) =>
      /^(direct answer|key numbers|recommended actions|risks|assumptions|notes|follow-up question|summary)\b/i.test(
        line.trim()
      )
    );

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      const isSectionHeader =
        /^(direct answer|key numbers|recommended actions|risks|assumptions|notes|follow-up question|summary)\b/i.test(
          lowerLine
        );
      const isActionLine =
        lowerLine.startsWith('action') ||
        lowerLine.startsWith('recommend') ||
        /^\d+[.)]/.test(line) ||
        lowerLine.startsWith('-');

      if (
        lowerLine.startsWith('action') ||
        lowerLine.startsWith('recommend') ||
        /^\d+[.)]/.test(line) ||
        lowerLine.startsWith('-')
      ) {
        actions.push(line.replace(/^[-\d.)\s]+/, '').trim());
      }

      if (isSectionHeader || (hasStructuredHeader && isActionLine)) {
        continue;
      }

      contentLines.push(line);
    }

    return {
      actions,
      displayContent:
        contentLines.join('\n') ||
        lines.find((line) => {
          return !/^(direct answer|key numbers|recommended actions|risks|assumptions|notes|follow-up question|summary)\b/i.test(
            line.trim()
          );
        }) ||
        ''
    };
  }

  private getModelLabel(modelId: string) {
    return (
      this.modelOptions.find(({ id }) => {
        return id === modelId;
      })?.label ?? modelId
    );
  }

  private getRequestErrorMessage(error: unknown) {
    if (!(error instanceof HttpErrorResponse)) {
      return undefined;
    }

    if (error.status === 0) {
      return $localize`Unable to reach the API endpoint. Please verify the backend is running and reachable, then retry.`;
    }

    const serverMessage =
      typeof error.error === 'string'
        ? error.error
        : typeof error.error?.message === 'string'
          ? error.error.message
          : undefined;

    if (serverMessage?.trim()) {
      return serverMessage.trim();
    }

    if (error.status && error.statusText) {
      return `${error.status} ${error.statusText}`;
    }

    if (error.status) {
      return `${error.status}`;
    }

    return error.message?.trim() || undefined;
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
    if (!this.hasPermissionToReadAiPrompt || !normalizedQuery) {
      return;
    }

    this.aiChatConversationsService.appendUserMessage({
      content: normalizedQuery,
      conversationId: conversation.id
    });
    this.shouldAutoScrollToBottom = true;

    this.pendingSubmissionQueue.push({
      conversationId: conversation.id,
      query: normalizedQuery,
      requestedModelId: this.selectedModelId,
      sessionId: conversation.sessionId
    });

    this.errorMessage = undefined;
    this.query = '';
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
        sessionId: submission.sessionId
      })
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.activeSubmission = undefined;
          this.scrollToBottom();
          this.markViewForUpdate();
          this.processSubmissionQueue();
        }),
        takeUntil(this.unsubscribeSubject)
      )
      .subscribe({
        next: (response) => {
          this.errorMessage = undefined;
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
          this.markViewForUpdate();
        },
        error: (error: unknown) => {
          const backendErrorMessage = this.getRequestErrorMessage(error);

          if (submission.requestedModelId !== 'auto') {
            this.pendingSubmissionQueue.unshift({
              ...submission,
              requestedModelId: 'auto'
            });

            this.errorMessage = backendErrorMessage
              ? $localize`Model ${this.getModelLabel(
                  submission.requestedModelId
                )} failed (${backendErrorMessage}). Retrying with Auto...`
              : $localize`Model ${this.getModelLabel(
                  submission.requestedModelId
                )} failed. Retrying with Auto...`;
            this.markViewForUpdate();

            return;
          }

          this.errorMessage = backendErrorMessage
            ? $localize`AI request failed: ${backendErrorMessage}`
            : $localize`AI request failed. Check your model quota and permissions.`;

          this.aiChatConversationsService.appendAssistantMessage({
            content: backendErrorMessage
              ? $localize`Request failed (${backendErrorMessage}). Please retry.`
              : $localize`Request failed. Please retry.`,
            conversationId: submission.conversationId
          });
          this.scrollToBottom();
          this.markViewForUpdate();
        }
      });
  }

  public onSubmitFromKeyboard(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.onSubmit();
  }

  public trackConversationById(
    _index: number,
    conversation: AiChatConversation
  ) {
    return conversation.id;
  }
}
