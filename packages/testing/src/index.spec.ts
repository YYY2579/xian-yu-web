import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('testing', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('testing placeholder');
  });
});
