import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import Maps from './Maps';

const maps = vi.hoisted(() => ({
  isLoaded: true,
  loaderOptions: null,
  autocompleteProps: null,
  mapInstance: null,
}));

vi.mock('@react-google-maps/api', async () => {
  const { useEffect } = await import('react');
  return {
    useJsApiLoader: (options) => {
      maps.loaderOptions = options;
      return { isLoaded: maps.isLoaded };
    },
    GoogleMap: ({ center, zoom, onLoad, children }) => {
      useEffect(() => { onLoad?.(maps.mapInstance); }, [onLoad]);
      return (
        <div data-testid="google-map" data-center={JSON.stringify(center)} data-zoom={zoom}>
          {children}
        </div>
      );
    },
    Marker: ({ position }) => <div data-testid="marker" data-position={JSON.stringify(position)} />,
    Autocomplete: (props) => {
      maps.autocompleteProps = props;
      useEffect(() => { props.onLoad?.(maps.autocomplete); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="autocomplete">{props.children}</div>;
    },
  };
});


beforeEach(() => {
  maps.isLoaded = true;
  maps.mapInstance = { panTo: vi.fn(), setZoom: vi.fn() };
  maps.autocomplete = { getPlace: vi.fn() };
});

describe('Maps page', () => {
  it('shows a loading state until the Maps script is ready', () => {
    maps.isLoaded = false;
    renderWithProviders(<Maps />);
    expect(screen.getByText('Initializing Google Maps Platform...')).toBeInTheDocument();
    expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search for an address/i)).not.toBeInTheDocument();
  });

  it('loads the Places library with the configured API key', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'maps-key');
    renderWithProviders(<Maps />);
    expect(maps.loaderOptions).toMatchObject({ id: 'google-map-script', googleMapsApiKey: 'maps-key', libraries: ['places'] });
  });

  it('renders the map centred on San Francisco with a marker and search box', () => {
    renderWithProviders(<Maps />);
    expect(screen.getByRole('heading', { name: /geographic explorer/i })).toBeInTheDocument();
    const center = { lat: 37.7749, lng: -122.4194 };
    expect(JSON.parse(screen.getByTestId('google-map').dataset.center)).toEqual(center);
    expect(JSON.parse(screen.getByTestId('marker').dataset.position)).toEqual(center);
    expect(screen.getByPlaceholderText('Search for an address or place...')).toBeInTheDocument();
  });

  it('moves the map and marker to the selected place', () => {
    renderWithProviders(<Maps />);
    maps.autocomplete.getPlace.mockReturnValue({
      geometry: { location: { lat: () => 48.8566, lng: () => 2.3522 } },
    });

    act(() => maps.autocompleteProps.onPlaceChanged());

    const paris = { lat: 48.8566, lng: 2.3522 };
    expect(JSON.parse(screen.getByTestId('google-map').dataset.center)).toEqual(paris);
    expect(JSON.parse(screen.getByTestId('marker').dataset.position)).toEqual(paris);
    expect(maps.mapInstance.panTo).toHaveBeenCalledWith(paris);
    expect(maps.mapInstance.setZoom).toHaveBeenCalledWith(14);
  });

  it('ignores places without geometry', () => {
    renderWithProviders(<Maps />);
    maps.autocomplete.getPlace.mockReturnValue({ name: 'typed text only' });
    act(() => maps.autocompleteProps.onPlaceChanged());
    expect(JSON.parse(screen.getByTestId('marker').dataset.position)).toEqual({ lat: 37.7749, lng: -122.4194 });
    expect(maps.mapInstance.panTo).not.toHaveBeenCalled();
  });
});
