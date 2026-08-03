import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('api', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('api placeholder');
  });
});
