import { AiAgentChatResponse } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { OverlayContainer } from '@angular/cdk/overlay';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick
} from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { GfFireAiChatPanelComponent } from './gf-fire-ai-chat-panel.component';

const STORAGE_KEY_MESSAGES = 'gf_fire_ai_chat_messages';
const STORAGE_KEY_SESSION_ID = 'gf_fire_ai_chat_session_id';

function createChatResponse({
  answer,
  sessionId,
  turns,
  llmInvocation,
  toolCalls,
  observability
}: {
  answer: string;
  sessionId: string;
  turns: number;
  llmInvocation?: {
    model: string;
    provider: string;
  };
  toolCalls?: {
    input: Record<string, unknown>;
    outputSummary: string;
    status: 'failed' | 'success';
    tool:
      | 'portfolio_analysis'
      | 'risk_assessment'
      | 'market_data_lookup'
      | 'rebalance_plan'
      | 'stress_test'
      | 'get_portfolio_summary'
      | 'get_current_holdings'
      | 'get_portfolio_risk_metrics'
      | 'get_recent_transactions'
      | 'get_live_quote'
      | 'get_asset_fundamentals'
      | 'get_financial_news'
      | 'calculate_rebalance_plan'
      | 'simulate_trade_impact'
      | 'transaction_categorize'
      | 'tax_estimate'
      | 'compliance_check';
  }[];
  observability?: {
    latencyBreakdownInMs: {
      llmGenerationInMs: number;
      memoryReadInMs: number;
      memoryWriteInMs: number;
      toolExecutionInMs: number;
    };
    latencyInMs: number;
    tokenEstimate: {
      input: number;
      output: number;
      total: number;
    };
    traceId?: string;
  };
}): AiAgentChatResponse {
  return {
    answer,
    citations: [
      {
        confidence: 0.9,
        snippet: 'FIRE analysis complete',
        source: 'portfolio_analysis'
      }
    ],
    confidence: {
      band: 'high',
      score: 0.91
    },
    memory: {
      sessionId,
      turns
    },
    toolCalls:
      toolCalls ?? [
        {
          input: {},
          outputSummary: 'FIRE analysis complete',
          status: 'success',
          tool: 'portfolio_analysis'
        }
      ],
    verification: [
      {
        check: 'fire_calculator_analysis',
        details: 'Retirement readiness assessed',
        status: 'passed'
      }
    ],
    llmInvocation,
    observability
  };
}

function createStoredMessage({
  content,
  id,
  role
}: {
  content: string;
  id: number;
  role: 'assistant' | 'user';
}) {
  return {
    content,
    createdAt: new Date().toISOString(),
    id,
    role
  };
}

describe('GfFireAiChatPanelComponent', () => {
  let component: GfFireAiChatPanelComponent;
  let fixture: ComponentFixture<GfFireAiChatPanelComponent>;
  let dataService: {
    postAiChat: jest.Mock;
    postAiChatFeedback: jest.Mock;
  };
  let overlayContainer: OverlayContainer;
  let overlayContainerElement: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();

    dataService = {
      postAiChat: jest.fn(),
      postAiChatFeedback: jest.fn(
        () => of({ accepted: true, feedbackId: 'fallback-feedback-id' })
      )
    };

    await TestBed.configureTestingModule({
      imports: [GfFireAiChatPanelComponent, NoopAnimationsModule],
      providers: [{ provide: DataService, useValue: dataService }]
    }).compileComponents();

    overlayContainer = TestBed.inject(OverlayContainer);
    overlayContainerElement = overlayContainer.getContainerElement();

    fixture = TestBed.createComponent(GfFireAiChatPanelComponent);
    component = fixture.componentInstance;
    component.hasPermissionToReadAiPrompt = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    overlayContainer.ngOnDestroy();
  });

  describe('Component Initialization', () => {
    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should have FIRE-specific starter prompts', () => {
      expect(component.starterPrompts).toContain('Am I on track for FIRE?');
      expect(component.starterPrompts).toContain('What is my current portfolio overview?');
      expect(component.starterPrompts).toContain('Estimate my taxes for this year.');
      expect(component.starterPrompts).toContain('How can I make an order?');
      expect(component.starterPrompts).toContain('Add test data for a quick check.');
    });

    it('should use FIRE-specific storage keys', () => {
      expect(component['STORAGE_KEY_MESSAGES']).toBe('gf_fire_ai_chat_messages');
      expect(component['STORAGE_KEY_SESSION_ID']).toBe('gf_fire_ai_chat_session_id');
    });

    it('should initialize with empty chat messages', () => {
      expect(component.chatMessages).toEqual([]);
    });

    it('should have assistant and user role labels', () => {
      expect(component.assistantRoleLabel).toBe('Assistant');
      expect(component.userRoleLabel).toBe('You');
    });
  });

  describe('Chat Functionality', () => {
    it('sends a chat query and appends assistant response', () => {
      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'Based on your current savings rate and FIRE number, you are on track for early retirement by age 45.',
            sessionId: 'fire-session-1',
            turns: 1
          })
        )
      );
      component.query = 'Am I on track for FIRE?';

      component.onSubmit();

      expect(dataService.postAiChat).toHaveBeenCalledWith({
        query: 'Am I on track for FIRE?',
        sessionId: undefined
      });
      expect(component.chatMessages).toHaveLength(2);
      expect(component.chatMessages[0]).toEqual(
        expect.objectContaining({
          content: 'Am I on track for FIRE?',
          role: 'user'
        })
      );
      expect(component.chatMessages[1]).toEqual(
        expect.objectContaining({
          content: 'Based on your current savings rate and FIRE number, you are on track for early retirement by age 45.',
          role: 'assistant'
        })
      );
      expect(localStorage.getItem(STORAGE_KEY_SESSION_ID)).toBe('fire-session-1');
    });

    it('emits chatCompleted after a successful assistant response', () => {
      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'FIRE analysis complete',
            sessionId: 'fire-completed',
            turns: 1
          })
        )
      );
      const completedSpy = jest.fn();
      component.chatCompleted.subscribe(completedSpy);
      component.query = 'Analyze my FIRE readiness';

      component.onSubmit();

      expect(completedSpy).toHaveBeenCalledTimes(1);
    });

    it('does not submit when permission is denied', () => {
      component.hasPermissionToReadAiPrompt = false;
      component.query = 'Help me plan retirement';

      component.onSubmit();

      expect(dataService.postAiChat).not.toHaveBeenCalled();
    });

    it('does not submit empty queries', () => {
      component.query = '   ';
      component.hasPermissionToReadAiPrompt = true;

      component.onSubmit();

      expect(dataService.postAiChat).not.toHaveBeenCalled();
    });

    it('adds a fallback assistant message when chat request fails', () => {
      dataService.postAiChat.mockReturnValue(
        throwError(() => {
          return new Error('request failed');
        })
      );
      component.query = 'What is my safe withdrawal rate?';

      component.onSubmit();

      expect(component.errorMessage).toBeDefined();
      expect(component.chatMessages[1]).toEqual(
        expect.objectContaining({
          content: 'Request failed. Please retry.',
          role: 'assistant'
        })
      );
    });

    it('returns a newest-first derived view list without mutating source order', () => {
      component.chatMessages = [
        {
          content: 'First message',
          createdAt: new Date(),
          id: 0,
          role: 'user'
        },
        {
          content: 'Second message',
          createdAt: new Date(),
          id: 1,
          role: 'assistant'
        }
      ];

      const visibleMessages = component.visibleMessages;

      expect(visibleMessages.map(({ id }) => id)).toEqual([1, 0]);
      expect(component.chatMessages.map(({ id }) => id)).toEqual([0, 1]);
    });
  });

  describe('Starter Prompts', () => {
    it('populates query when a starter prompt is selected', () => {
      component.onSelectStarterPrompt('What if I increase my savings rate by 5%?');

      expect(component.query).toBe('What if I increase my savings rate by 5%?');
    });
  });

  describe('Session Persistence', () => {
    it('reuses session id across consecutive prompts', () => {
      dataService.postAiChat
        .mockReturnValueOnce(
          of(
            createChatResponse({
              answer: 'First FIRE analysis',
              sessionId: 'fire-session-abc',
              turns: 1
            })
          )
        )
        .mockReturnValueOnce(
          of(
            createChatResponse({
              answer: 'Second FIRE analysis',
              sessionId: 'fire-session-abc',
              turns: 2
            })
          )
        );

      component.query = 'First prompt';
      component.onSubmit();
      component.query = 'Second prompt';
      component.onSubmit();

      expect(dataService.postAiChat).toHaveBeenNthCalledWith(1, {
        query: 'First prompt',
        sessionId: undefined
      });
      expect(dataService.postAiChat).toHaveBeenNthCalledWith(2, {
        query: 'Second prompt',
        sessionId: 'fire-session-abc'
      });
    });

    it('restores chat session and messages from local storage', () => {
      localStorage.setItem(STORAGE_KEY_SESSION_ID, 'fire-session-restored');
      localStorage.setItem(
        STORAGE_KEY_MESSAGES,
        JSON.stringify([
          createStoredMessage({
            content: 'When can I retire?',
            id: 11,
            role: 'user'
          }),
          createStoredMessage({
            content: 'You can retire by age 50 with your current savings rate.',
            id: 12,
            role: 'assistant'
          })
        ])
      );

      const restoredFixture = TestBed.createComponent(GfFireAiChatPanelComponent);
      const restoredComponent = restoredFixture.componentInstance;
      restoredComponent.hasPermissionToReadAiPrompt = true;
      restoredFixture.detectChanges();

      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'Follow-up FIRE analysis',
            sessionId: 'fire-session-restored',
            turns: 3
          })
        )
      );

      restoredComponent.query = 'What about inflation?';
      restoredComponent.onSubmit();

      expect(restoredComponent.chatMessages).toHaveLength(4);
      expect(dataService.postAiChat).toHaveBeenCalledWith({
        query: 'What about inflation?',
        sessionId: 'fire-session-restored'
      });
    });

    it('ignores invalid chat storage payload without throwing', () => {
      localStorage.setItem(STORAGE_KEY_MESSAGES, '{invalid-json}');

      const restoredFixture = TestBed.createComponent(GfFireAiChatPanelComponent);
      const restoredComponent = restoredFixture.componentInstance;
      restoredComponent.hasPermissionToReadAiPrompt = true;

      expect(() => {
        restoredFixture.detectChanges();
      }).not.toThrow();
      expect(restoredComponent.chatMessages).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY_MESSAGES)).toBeNull();
    });

    it('caps restored chat history to the most recent 200 messages', () => {
      const storedMessages = Array.from({ length: 250 }, (_, index) => {
        return createStoredMessage({
          content: `message-${index}`,
          id: index,
          role: index % 2 === 0 ? 'user' : 'assistant'
        });
      });
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(storedMessages));

      const restoredFixture = TestBed.createComponent(GfFireAiChatPanelComponent);
      const restoredComponent = restoredFixture.componentInstance;
      restoredComponent.hasPermissionToReadAiPrompt = true;
      restoredFixture.detectChanges();

      expect(restoredComponent.chatMessages).toHaveLength(200);
      expect(restoredComponent.chatMessages[0].id).toBe(50);
    });
  });

  describe('Feedback', () => {
    it('sends feedback for assistant responses', () => {
      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'FIRE response',
            sessionId: 'fire-feedback',
            turns: 1
          })
        )
      );
      dataService.postAiChatFeedback.mockReturnValue(
        of({
          accepted: true,
          feedbackId: 'fire-feedback-1'
        })
      );
      component.query = 'Analyze my FIRE plan';

      component.onSubmit();
      component.onRateResponse({ messageId: 1, rating: 'up' });

      expect(dataService.postAiChatFeedback).toHaveBeenCalledWith({
        rating: 'up',
        sessionId: 'fire-feedback'
      });
      expect(component.chatMessages[1].feedback).toEqual({
        feedbackId: 'fire-feedback-1',
        isSubmitting: false,
        rating: 'up'
      });
    });

    it('disables feedback button after rating is submitted', () => {
      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'Response',
            sessionId: 'feedback-test',
            turns: 1
          })
        )
      );
      component.query = 'Test';
      component.onSubmit();

      const messageBeforeRating = component.chatMessages[1];

      expect(messageBeforeRating.feedback?.rating).toBeUndefined();

      component.onRateResponse({ messageId: 1, rating: 'down' });
      fixture.detectChanges();

      const messageAfterRating = component.chatMessages[1];

      expect(messageAfterRating.feedback?.rating).toBe('down');
    });
  });

  describe('Response Details', () => {
    it('shows diagnostics in info popover with LLM invocation details', fakeAsync(() => {
      const nativeElement = fixture.nativeElement as HTMLElement;

      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'You can retire comfortably with 4% withdrawal rate.',
            sessionId: 'fire-details',
            turns: 1,
            llmInvocation: {
              model: 'gpt-4o-mini',
              provider: 'openai'
            },
            toolCalls: [
              {
                input: {},
                outputSummary: 'Portfolio analyzed for FIRE',
                status: 'success',
                tool: 'portfolio_analysis'
              }
            ],
            observability: {
              latencyBreakdownInMs: {
                llmGenerationInMs: 15,
                memoryReadInMs: 3,
                memoryWriteInMs: 5,
                toolExecutionInMs: 10
              },
              latencyInMs: 33,
              tokenEstimate: {
                input: 15,
                output: 25,
                total: 40
              },
              traceId: 'fire-trace-details'
            }
          })
        )
      );
      component.query = 'Can I retire at 4% SWR?';

      component.onSubmit();
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const detailsTrigger = nativeElement.querySelector(
        '.chat-details-trigger'
      ) as HTMLButtonElement | null;

      expect(detailsTrigger).toBeTruthy();

      detailsTrigger?.click();
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const overlayText = overlayContainerElement.textContent ?? '';

      expect(overlayText).toContain('Confidence');
      expect(overlayText).toContain('LLM');
      expect(overlayText).toContain('openai');
      expect(overlayText).toContain('gpt-4o-mini');
      expect(overlayText).toContain('Tools');
      expect(overlayText).toContain('portfolio_analysis');
    expect(overlayText).toContain('Trace ID');
    expect(overlayText).toContain('fire-trace-details');
    }));

    it('displays trace ID when available in observability', fakeAsync(() => {
      dataService.postAiChat.mockReturnValue(
        of(
          createChatResponse({
            answer: 'Response with trace',
            sessionId: 'trace-test',
            turns: 1,
            observability: {
              latencyInMs: 25,
              tokenEstimate: {
                input: 10,
                output: 20,
                total: 30
              },
              traceId: 'custom-trace-id-123'
            }
          })
        )
      );
      component.query = 'Test trace';

      component.onSubmit();
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      component.onOpenResponseDetails(component.chatMessages[1].response);
      fixture.detectChanges();

      expect(component.activeResponseDetails).toBeDefined();
      expect(component.activeResponseDetails?.observability?.traceId).toBe('custom-trace-id-123');
    }));
  });

  describe('Error Handling', () => {
    it('displays permission denied message when no permission', () => {
      component.hasPermissionToReadAiPrompt = false;
      fixture.detectChanges();

      const nativeElement = fixture.nativeElement as HTMLElement;
      const alertMessage = nativeElement.querySelector('.alert');

      expect(alertMessage?.textContent).toContain('need AI prompt permission');
    });

    it('hides starter prompts when permission is denied', () => {
      component.hasPermissionToReadAiPrompt = false;
      fixture.detectChanges();

      const nativeElement = fixture.nativeElement as HTMLElement;
      const promptList = nativeElement.querySelector('.prompt-list');

      expect(promptList).toBeNull();
    });
  });
});
