import { buildUberLink } from './uber';

const params = (url) => new URL(url).searchParams;

describe('buildUberLink', () => {
  it('uses the current location when no pickup is given', () => {
    const url = buildUberLink({ dropoff: { lat: 52.52, lng: 13.405, address: 'Berlin', nickname: 'Home' } });
    expect(url.startsWith('https://m.uber.com/ul/?action=setPickup&')).toBe(true);
    expect(params(url).get('pickup')).toBe('my_location');
    expect(params(url).get('dropoff[latitude]')).toBe('52.52');
    expect(params(url).get('dropoff[longitude]')).toBe('13.405');
    expect(params(url).get('dropoff[formatted_address]')).toBe('Berlin');
    expect(params(url).get('dropoff[nickname]')).toBe('Home');
  });

  it('includes an explicit pickup and skips missing fields', () => {
    const url = buildUberLink({
      pickup: { lat: 0, lng: 0, address: 'Null Island & Co' },
      dropoff: { address: 'Somewhere' },
    });
    expect(params(url).get('pickup')).toBeNull();
    expect(params(url).get('pickup[latitude]')).toBe('0');
    expect(params(url).get('pickup[formatted_address]')).toBe('Null Island & Co');
    expect(params(url).get('dropoff[latitude]')).toBeNull();
    expect(params(url).get('dropoff[nickname]')).toBeNull();
    expect(url).not.toContain(' ');
  });
});
