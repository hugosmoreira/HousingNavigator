import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PhoneLink from './PhoneLink';

describe('PhoneLink', () => {
  it('keeps the visible extension and makes a separate extension parameter', () => {
    const html = renderToStaticMarkup(<PhoneLink phone="503-235-8786 ext. 1008" />);
    expect(html).toContain('href="tel:+15032358786;ext=1008"');
    expect(html).toContain('>503-235-8786 ext. 1008</a>');
    expect(html).not.toContain('tel:50323587861008');
  });

  it('retains uncertain contact information as non-clickable text', () => {
    const html = renderToStaticMarkup(<PhoneLink phone="503-235-8786 or 360-992-3000" />);
    expect(html).toContain('503-235-8786 or 360-992-3000');
    expect(html).not.toContain('<a');
  });

  it('preserves child icons/labels and styling', () => {
    const html = renderToStaticMarkup(
      <PhoneLink phone="211" className="phone-contact"><span>Call 211</span></PhoneLink>,
    );
    expect(html).toContain('href="tel:211"');
    expect(html).toContain('class="phone-contact"');
    expect(html).toContain('<span>Call 211</span>');
  });

  it('renders no empty contact', () => {
    expect(renderToStaticMarkup(<PhoneLink phone={null} />)).toBe('');
  });
});
