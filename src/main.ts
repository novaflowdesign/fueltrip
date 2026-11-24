import './style.css';
import { createMap } from './map/map.ts';

const mapContainer = document.getElementById('map');
if (!mapContainer) {
  throw new Error('Missing #map container');
}

createMap(mapContainer);
