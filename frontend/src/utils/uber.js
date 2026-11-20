import { api } from '../api/axios';

const UBER_BASE_URL = 'https://m.uber.com/looking';

/**
 * Builds an Uber universal ride link in the format Uber documents:
 * `https://m.uber.com/looking?pickup=<Location JSON>&drop[0]=<Location JSON>`. Uber only places
 * locations that have coordinates. Without a pickup Uber uses (or asks for) the rider's location.
 * Places are `{ lat, lng, address, nickname }`.
 */
export function buildUberLink({ pickup, dropoff }) {
  const location = (place) => JSON.stringify({
    latitude: place.lat,
    longitude: place.lng,
    addressLine1: place.nickname || place.address || '',
    addressLine2: place.address || '',
  });
  const hasCoords = (place) => place && place.lat != null && place.lng != null;

  const params = new URLSearchParams();
  if (hasCoords(pickup)) params.set('pickup', location(pickup));
  if (hasCoords(dropoff)) params.set('drop[0]', location(dropoff));
  const query = params.toString();
  return query ? `${UBER_BASE_URL}?${query}` : UBER_BASE_URL;
}

/**
 * Opens Uber for a free-text destination. The backend geocodes the address, so the
 * tab is opened synchronously (inside the click) to avoid popup blockers and pointed
 * at the link once it arrives.
 */
export async function openUberRide(dropoff, nickname) {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const { data } = await api.get('/api/uber/ride-link', { params: { dropoff, nickname } });
    if (tab) tab.location.href = data.url;
    else window.location.assign(data.url);
  } catch (e) {
    tab?.close();
    alert('Could not open Uber: ' + (e.response?.data?.message || e.message));
  }
}
