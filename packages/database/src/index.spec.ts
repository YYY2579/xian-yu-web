import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('database', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('database placeholder');
  });
});
