// app.js — Frontend initialization (runs on every page after all other scripts)
(function () {
  // Update user display in sidebar/avatar
  if (typeof updateUserDisplay === 'function') updateUserDisplay();

  // Sync notification badges on load
  if (typeof syncNotifBadges === 'function') syncNotifBadges();
})();
