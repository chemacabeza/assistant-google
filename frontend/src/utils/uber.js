import { api } from '../api/axios';

const UBER_BASE_URL = 'https://m.uber.com/ul/';

/**
 * Builds an Uber deep link that opens the Uber app (or m.uber.com) with the trip
 * pre-filled. Without a pickup Uber uses the device's current location.
 * Places are `{ lat, lng, address, nickname }`; only lat/lng are needed to place the pin.
 */
export function buildUberLink({ pickup, dropoff }) {
  const params = new URLSearchParams({ action: 'setPickup' });
  const addPlace = (key, place) => {
    if (place.lat != null && place.lng != null) {
      params.set(`${key}[latitude]`, String(place.lat));
      params.set(`${key}[longitude]`, String(place.lng));
    }
    if (place.address) params.set(`${key}[formatted_address]`, place.address);
    if (place.nickname) params.set(`${key}[nickname]`, place.nickname);
  };

  if (pickup) addPlace('pickup', pickup);
  else params.set('pickup', 'my_location');
  addPlace('dropoff', dropoff);

  return `${UBER_BASE_URL}?${params.toString()}`;
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
