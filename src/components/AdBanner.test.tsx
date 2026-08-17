import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import AdBanner from './AdBanner';

describe('AdBanner', () => {
  it('renders an empty placeholder slot when no ad unit ID is configured', () => {
    // VITE_ADMOB_BANNER_ID is intentionally left unset in the test env,
    // matching the real state until an AdMob account exists (see the design
    // doc's manual-setup section) -- this is the actual default behavior
    // every test run and every deploy will have until that account exists.
    const { container } = render(<AdBanner />);
    const banner = container.querySelector('.ad-banner');
    expect(banner).toHaveClass('ad-banner-placeholder');
    expect(banner).not.toHaveAttribute('data-ad-unit');
  });
});
