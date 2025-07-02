const nairobiSubcounties = require('../data/nairobi-subcounties.json');

/**
 * Detects Nairobi subcounty from coordinates
 */
exports.getSubcounty = (lng, lat) => {
  if (!lng || !lat) return 'Unknown';
  
  const point = [parseFloat(lng), parseFloat(lat)];
  
  for (const feature of nairobiSubcounties.features) {
    if (this.pointInPolygon(point, feature.geometry.coordinates[0])) {
      return feature.properties.name;
    }
  }
  
  return 'Unknown';
};

/**
 * Raycasting algorithm for point-in-polygon
 */
exports.pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    
    const intersect = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Calculates distance between two points in Nairobi (in km)
 */
exports.calculateDistance = (coords1, coords2) => {
  const [lng1, lat1] = coords1;
  const [lng2, lat2] = coords2;
  
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};
