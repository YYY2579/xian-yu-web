import { describe, expect, it } from 'vitest';
import { placeholder } from './index';

describe('datasource-sdk', () => {
  it('exports a placeholder', () => {
    expect(placeholder()).toBe('datasource-sdk placeholder');
  });
});
