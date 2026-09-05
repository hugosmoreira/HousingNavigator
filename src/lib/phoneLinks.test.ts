import { describe, expect, it } from 'vitest';
import { phoneHref } from './phoneLinks';
import { STATIC_PROGRAMS, STATIC_AFFORDABLE_PROPERTIES } from '../services/data/staticDataService';

describe('provider telephone links', () => {
  it.each([
    '503-235-8786 ext. 1008',
    '503-235-8786 ext 1008',
    '503-235-8786 EXT: 1008',
    '(503) 235-8786 extension 1008',
    '503.235.8786x1008',
    '503–235–8786 #1008',
    '+1 (503) 235-8786;ext=1008',
    'tel:+15032358786;ext=1008',
  ])('separates the extension in %s', value => {
    expect(phoneHref(value)).toBe('tel:+15032358786;ext=1008');
  });

  it.each([
    ['503-235-8786', 'tel:+15032358786'],
    [' (503) 280-4700 ', 'tel:+15032804700'],
    ['1-855-657-8387', 'tel:+18556578387'],
    ['+1 503 235 8786', 'tel:+15032358786'],
    ['+44 20 7946 0958', 'tel:+442079460958'],
    ['+44 20 7946 0958 ext. 012', 'tel:+442079460958;ext=012'],
    ['211', 'tel:211'],
    ['988', 'tel:988'],
    ['911', 'tel:911'],
  ])('formats %s without changing its destination', (value, expected) => {
    expect(phoneHref(value)).toBe(expected);
  });

  it.each([
    null, undefined, '', '  ', 'Call the provider', 'N/A',
    '503-235-8786 ext.', '503-235-8786 x1008 x2',
    '503-235-8786 / 360-992-3000', '503-235-8786 or 360-992-3000',
    '503-235-8786 (TTY)', '1-800-FLOWERS', '235-8786',
    '503-235-8786,1008', '503-235-8786;1008',
    '++15032358786', '+', '+211', '+0000000000',
    'tel:javascript:alert(1)', '503-235-8786?x=1008',
    '503-235-87861008', '211 ext 1008', '1'.repeat(129),
  ])('does not fabricate a link for %s', value => {
    expect(phoneHref(value)).toBeNull();
  });

  it('keeps every current published resource and apartment phone dialable', () => {
    for (const item of [...STATIC_PROGRAMS, ...STATIC_AFFORDABLE_PROPERTIES]) {
      if (item.phone) expect(phoneHref(item.phone), item.phone).not.toBeNull();
    }
  });
});
