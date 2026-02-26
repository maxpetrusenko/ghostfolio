import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI submission docs', () => {
  it('keeps docs/submission.md scaffold with required artifact sections', () => {
    const filePath = resolve(process.cwd(), 'docs/submission.md');
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('# AI Submission Artifacts');
    expect(content).toContain('## Public AI Deployment');
    expect(content).toContain('## Demo Video');
    expect(content).toContain('## Social Post');
    expect(content).toContain('## Verification Checklist');
    expect(content).toContain('TODO_ADD_PUBLIC_AI_ENDPOINT_URL');
    expect(content).toContain('TODO_ADD_DEMO_VIDEO_URL');
    expect(content).toContain('TODO_ADD_SOCIAL_POST_URL');
  });
});
