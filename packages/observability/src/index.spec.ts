import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('observability', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('observability placeholder');
  });
});
