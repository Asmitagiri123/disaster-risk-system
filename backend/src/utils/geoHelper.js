// Users with an active location within the radius (km)
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

module.exports = { getUsersInRadius };
