import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI architecture docs', () => {
  it('keeps docs/ai_agents.md non-empty and section-complete', () => {
    const filePath = resolve(process.cwd(), 'docs/ai_agents.md');
    const content = readFileSync(filePath, 'utf8');

    expect(content.trim().length).toBeGreaterThan(0);

    const requiredHeadings = [
      '## Core Agent Components',
      '### 1) Reasoning Engine (LLM Orchestration)',
      '### 2) Tool Registry and Structured Contracts',
      '### 3) Orchestrator (Multi-Step Execution)',
      '### 4) Memory and Context System',
      '### 5) Verification Layer',
      '### 6) Output Formatter (Citations + Confidence)',
      '## Evaluation Framework',
      '## Observability and Feedback',
      '## Requirements Mapping Checklist'
    ];

    for (const heading of requiredHeadings) {
      expect(content).toContain(heading);
    }
  });
});
