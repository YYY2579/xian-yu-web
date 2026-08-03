import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('collector-worker', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('collector-worker placeholder');
  });
});
