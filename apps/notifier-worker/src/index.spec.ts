import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('notifier-worker', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('notifier-worker placeholder');
  });
});
