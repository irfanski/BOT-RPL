import NodeCache from 'node-cache';

// Cache untuk menyimpan state user (TTL: 10 menit)
const sessionCache = new NodeCache({ stdTTL: 600 });

// Set session state
function setState(phoneNumber, state, data = {}) {
  sessionCache.set(phoneNumber, { state, data, timestamp: Date.now() });
}

// Get session state
function getState(phoneNumber) {
  return sessionCache.get(phoneNumber) || null;
}

// Clear session state
function clearState(phoneNumber) {
  sessionCache.del(phoneNumber);
}

// Check apakah user sedang dalam flow tertentu
function isInFlow(phoneNumber) {
  const session = getState(phoneNumber);
  return session !== null;
}

// Update data di session tanpa ubah state
function updateData(phoneNumber, newData) {
  const session = getState(phoneNumber);
  if (session) {
    session.data = { ...session.data, ...newData };
    sessionCache.set(phoneNumber, session);
  }
}

export { setState, getState, clearState, isInFlow, updateData };