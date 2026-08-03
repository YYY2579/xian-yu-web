import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('processor-worker', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('processor-worker placeholder');
  });
});
