import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('queue', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('queue placeholder');
  });
});
