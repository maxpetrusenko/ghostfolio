import {
  DEFAULT_REQUEST_TIMEOUT_FALLBACK_IN_MS,
  getRequestTimeoutInMs
} from './ai-llm.providers';

describe('AiLlmProviders', () => {
  const originalTimeout = process.env.AI_AGENT_LLM_TIMEOUT_IN_MS;

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.AI_AGENT_LLM_TIMEOUT_IN_MS;
    } else {
      process.env.AI_AGENT_LLM_TIMEOUT_IN_MS = originalTimeout;
    }
  });

  it('defaults to fast timeout fallback when env is missing', () => {
    delete process.env.AI_AGENT_LLM_TIMEOUT_IN_MS;

    expect(getRequestTimeoutInMs()).toBe(
      DEFAULT_REQUEST_TIMEOUT_FALLBACK_IN_MS
    );
    expect(getRequestTimeoutInMs()).toBe(1500);
  });

  it('uses configured timeout when env is a positive integer', () => {
    process.env.AI_AGENT_LLM_TIMEOUT_IN_MS = '1200';

    expect(getRequestTimeoutInMs()).toBe(1200);
  });

  it('falls back when env timeout is invalid', () => {
    process.env.AI_AGENT_LLM_TIMEOUT_IN_MS = 'not-a-number';

    expect(getRequestTimeoutInMs()).toBe(
      DEFAULT_REQUEST_TIMEOUT_FALLBACK_IN_MS
    );
  });
});
