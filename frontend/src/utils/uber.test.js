import { buildUberLink } from './uber';

const params = (url) => new URL(url).searchParams;
const loc = (url, name) => JSON.parse(params(url).get(name));

describe('buildUberLink', () => {
  it('sets only drop[0] without a pickup, so Uber uses the rider location', () => {
    const url = buildUberLink({ dropoff: { lat: 52.52, lng: 13.405, address: 'Berlin, Germany', nickname: 'Home' } });
    expect(url.startsWith('https://m.uber.com/looking?drop%5B0%5D=')).toBe(true);
    expect(params(url).get('pickup')).toBeNull();
    expect(loc(url, 'drop[0]')).toEqual({ latitude: 52.52, longitude: 13.405, addressLine1: 'Home', addressLine2: 'Berlin, Germany' });
  });

  it('includes an explicit pickup, falls back to the address as name, and leaves out places without coordinates', () => {
    const url = buildUberLink({
      pickup: { lat: 0, lng: 0, address: 'Null Island & Co' },
      dropoff: { address: 'Somewhere' },
    });
    expect(loc(url, 'pickup')).toEqual({ latitude: 0, longitude: 0, addressLine1: 'Null Island & Co', addressLine2: 'Null Island & Co' });
    expect(params(url).get('drop[0]')).toBeNull();
    expect(url).not.toContain(' ');
  });

  it('is the bare booking page when nothing has coordinates', () => {
    expect(buildUberLink({ dropoff: { address: 'Somewhere' } })).toBe('https://m.uber.com/looking');
  });
});
