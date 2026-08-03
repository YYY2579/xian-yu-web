import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('scheduler', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('scheduler placeholder');
  });
});
