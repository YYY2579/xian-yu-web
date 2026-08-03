import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('config', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('config placeholder');
  });
});
