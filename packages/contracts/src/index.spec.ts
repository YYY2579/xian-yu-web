import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('contracts', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('contracts placeholder');
  });
});
