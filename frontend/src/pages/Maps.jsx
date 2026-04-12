import React, { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from '@react-google-maps/api';
import { MapPin, Search } from 'lucide-react';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194
};

const libraries = ['places'];

const Maps = () => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [markerPosition, setMarkerPosition] = useState(defaultCenter);
  const [autocomplete, setAutocomplete] = useState(null);

  const onLoad = useCallback(function callback(map) {
    // Optionally bounds configuration
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback(map) {
    setMap(null);
  }, []);

  const onLoadAutocomplete = (autocompleteInstance) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        const newLat = place.geometry.location.lat();
        const newLng = place.geometry.location.lng();
        setMapCenter({ lat: newLat, lng: newLng });
        setMarkerPosition({ lat: newLat, lng: newLng });
        if (map) {
           map.panTo({ lat: newLat, lng: newLng });
           map.setZoom(14);
        }
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between z-10 bg-white shadow-sm relative">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <MapPin className="text-blue-500" /> Geographic Explorer
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Navigate the integrated Google Maps interactive canvas.
          </p>
        </div>
        
        {isLoaded && (
            <div className="w-96 relative shadow-sm rounded-lg overflow-hidden border border-gray-200">
               <Autocomplete onLoad={onLoadAutocomplete} onPlaceChanged={onPlaceChanged}>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Search size={16} />
                   </div>
                   <input
                     type="text"
                     placeholder="Search for an address or place..."
                     className="w-full bg-slate-50 py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium text-gray-700"
                   />
                 </div>
               </Autocomplete>
            </div>
        )}
      </div>

      <div className="flex-1 relative">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={mapCenter}
            zoom={10}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={{
               disableDefaultUI: false,
               zoomControl: true,
               streetViewControl: true,
               mapTypeControl: true,
            }}
          >
            <Marker position={markerPosition} />
          </GoogleMap>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50">
            <div className="animate-spin inline-block w-8 h-8 border-[3px] border-blue-200 border-t-blue-600 rounded-full mb-4"></div>
            <p className="text-slate-500 font-medium">Initializing Google Maps Platform...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(Maps);
