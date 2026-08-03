import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('analyzer-worker', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('analyzer-worker placeholder');
  });
});
