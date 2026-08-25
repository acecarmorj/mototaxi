/**
 * Cliente HTTP do MotoJá API (Cloudflare Worker + D1).
 */

const DEFAULT_API =
  import.meta.env.VITE_API_URL || "https://mototaxi-api.acecarmorj.workers.dev";

export function getApiBase() {
  return (DEFAULT_API || "").replace(/\/+$/, "");
}

function deviceKey(role) {
  return `carmoto:device:${role}`;
}

export function getDeviceId(role = "passenger") {
  const key = deviceKey(role);
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

const PASSENGER_PROFILE_KEY = "carmoto:passenger:profile";

export function loadPassengerProfile() {
  try {
    const raw = localStorage.getItem(PASSENGER_PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.name && p?.phone) return p;
  } catch {
    /* ignore */
  }
  return null;
}

export function savePassengerProfile(profile) {
  localStorage.setItem(PASSENGER_PROFILE_KEY, JSON.stringify(profile));
}

async function request(path, options = {}) {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),

  registerPassenger: (payload) =>
    request("/api/passengers", { method: "POST", body: JSON.stringify(payload) }),

  getPassengerMe: (deviceId) =>
    request(`/api/passengers/me?device_id=${encodeURIComponent(deviceId)}`),

  registerDriver: (payload) =>
    request("/api/drivers", { method: "POST", body: JSON.stringify(payload) }),

  setDriverStatus: (driverId, payload) =>
    request(`/api/drivers/${driverId}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateDriverLocation: (driverId, lat, lng) =>
    request(`/api/drivers/${driverId}/location`, {
      method: "PATCH",
      body: JSON.stringify({ lat, lng }),
    }),

  driverStats: (driverId, period = "today") =>
    request(
      `/api/drivers/${encodeURIComponent(driverId)}/stats?period=${encodeURIComponent(period)}`
    ),

  nearbyDrivers: (lat, lng, radiusKm = 15) => {
    const q = new URLSearchParams();
    if (lat != null) q.set("lat", String(lat));
    if (lng != null) q.set("lng", String(lng));
    q.set("radius_km", String(radiusKm));
    return request(`/api/drivers/nearby?${q}`);
  },

  createRide: (payload) =>
    request("/api/rides", { method: "POST", body: JSON.stringify(payload) }),

  getRide: (rideId) => request(`/api/rides/${rideId}`),

  pendingRides: () => request("/api/rides/pending"),

  acceptRide: (rideId, driverId) =>
    request(`/api/rides/${rideId}/accept`, {
      method: "PATCH",
      body: JSON.stringify({ driver_id: driverId }),
    }),

  completeRide: (rideId) =>
    request(`/api/rides/${rideId}/complete`, { method: "PATCH", body: "{}" }),

  cancelRide: (rideId) =>
    request(`/api/rides/${rideId}/cancel`, { method: "PATCH", body: "{}" }),

  adminSummary: (password, period = "30d") =>
    request(`/api/admin/summary?period=${encodeURIComponent(period)}`, {
      headers: { "X-Admin-Password": password },
    }),

  adminDriverReports: (password, period = "30d") =>
    request(`/api/admin/driver-reports?period=${encodeURIComponent(period)}`, {
      headers: { "X-Admin-Password": password },
    }),

  adminPassengers: (password, q = "") => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return request(`/api/admin/passengers${qs}`, {
      headers: { "X-Admin-Password": password },
    });
  },

  adminDrivers: (password, q = "") => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return request(`/api/admin/drivers${qs}`, {
      headers: { "X-Admin-Password": password },
    });
  },

  adminRides: (password, { q = "", status = "", period = "30d" } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (period) params.set("period", period);
    const qs = params.toString() ? `?${params}` : "";
    return request(`/api/admin/rides${qs}`, {
      headers: { "X-Admin-Password": password },
    });
  },

  adminCancelRide: (password, rideId) =>
    request(`/api/admin/rides/${rideId}/cancel`, {
      method: "PATCH",
      headers: { "X-Admin-Password": password },
      body: "{}",
    }),

  adminBlockDriver: (password, driverId, blocked) =>
    request(`/api/admin/drivers/${driverId}/block`, {
      method: "PATCH",
      headers: { "X-Admin-Password": password },
      body: JSON.stringify({ blocked }),
    }),
};
