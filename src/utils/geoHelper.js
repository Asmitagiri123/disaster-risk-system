/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Find all registered users within a given radius (km) of a location
 */
const getUsersInRadius = async (User, latitude, longitude, radiusKm) => {
  return User.find({
    location: {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], radiusKm / 6371],
      },
    },
    isActive: true,
  });
};

/**
 * Validate coordinate values
 */
const isValidCoordinate = (lat, lon) => {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
};

module.exports = { getDistance, getUsersInRadius, isValidCoordinate };
