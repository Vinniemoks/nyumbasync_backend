const axios = require('axios');
const nairobiSubcounties = require('../data/nairobi-subcounties.json');

class LocationService {
  async geocodeNairobiAddress(address) {
    try {
      // First try Google Maps
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address: `${address}, Nairobi, Kenya`,
            key: process.env.GOOGLE_MAPS_KEY,
            region: 'ke'
          }
        }
      );

      const result = response.data.results[0];
      if (!result) throw new Error('ADDRESS_NOT_FOUND');

      // Verify within Nairobi bounds
      const { lng, lat } = result.geometry.location;
      if (!this._isInNairobi(lng, lat)) {
        throw new Error('ADDRESS_OUTSIDE_NAIROBI');
      }

      return {
        coordinates: [lng, lat],
        subcounty: this._detectSubcounty(lng, lat),
        formattedAddress: result.formatted_address
      };
    } catch (error) {
      // Fallback to simpler verification
      return this._basicKenyaVerification(address);
    }
  }

  _isInNairobi(lng, lat) {
    return (
      lng >= 36.65 && lng <= 37.05 &&
      lat >= -1.55 && lat <= -1.10
    );
  }

  _detectSubcounty(lng, lat) {
    // Using GeoJSON polygons from nairobi-subcounties.json
    return nairobiSubcounties.features.find(feature =>
      this._pointInPolygon([lng, lat], feature.geometry.coordinates[0])
    )?.properties?.name || 'Unknown';
  }

  _pointInPolygon(point, polygon) {
    // Ray-casting algorithm implementation
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > point[1]) !== (yj > point[1])) &&
        (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

module.exports = new LocationService();
