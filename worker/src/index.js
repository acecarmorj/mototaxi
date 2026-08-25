/**
 * MotoJá API — Cloudflare Worker + D1
 * Auth passageiro/motorista: device_id
 * Admin: header X-Admin-Password = env.ADMIN_PASSWORD
 */

const ALLOWED_ORIGINS = [
  "https://motoja.pages.dev",
  "https://mototaxi.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Admin-Password",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function id() {
  return crypto.randomUUID();
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Digits only; BR mobile/landline with DDD (10–11) or with 55 (12–13). */
function normalizePhoneBr(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d;
}

function isValidPhoneBr(raw) {
  const d = normalizePhoneBr(raw);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  return true;
}

function formatPhoneBr(raw) {
  const d = normalizePhoneBr(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(raw || "");
}

const RIDE_ACCEPT_SECONDS = 15;

async function expireStaleSearchingRides(env) {
  await env.DB.prepare(
    `UPDATE rides SET status = 'cancelled', cancel_reason = 'expired'
     WHERE status = 'searching'
       AND created_at < datetime('now', ?)`
  )
    .bind(`-${RIDE_ACCEPT_SECONDS} seconds`)
    .run();
}

function withRideExpiry(ride) {
  if (!ride) return ride;
  const created = String(ride.created_at || "").replace(" ", "T");
  const createdMs = Date.parse(/Z|[+-]\d{2}:?\d{2}$/i.test(created) ? created : `${created}Z`);
  const base = Number.isNaN(createdMs) ? Date.now() : createdMs;
  const displayStatus =
    ride.status === "cancelled" && ride.cancel_reason === "expired" ? "expired" : ride.status;
  const fareValue =
    ride.fare_final != null
      ? Number(ride.fare_final)
      : ride.fare_estimate != null
      ? Number(ride.fare_estimate)
      : null;
  return {
    ...ride,
    display_status: displayStatus,
    fare_value: fareValue,
    accept_window_sec: RIDE_ACCEPT_SECONDS,
    expires_at: new Date(base + RIDE_ACCEPT_SECONDS * 1000).toISOString(),
  };
}

/** period: today | 7d | 30d | month | all */
function periodSqlFilter(period, column = "created_at") {
  const p = String(period || "30d").toLowerCase();
  if (p === "today" || p === "hoje") {
    return {
      clause: `${column} >= datetime('now', 'start of day')`,
      label: "hoje",
      startExpr: `datetime('now', 'start of day')`,
    };
  }
  if (p === "7d" || p === "semana") {
    return {
      clause: `${column} >= datetime('now', '-7 days')`,
      label: "7 dias",
      startExpr: `datetime('now', '-7 days')`,
    };
  }
  if (p === "month" || p === "mes" || p === "mês") {
    return {
      clause: `${column} >= datetime('now', 'start of month')`,
      label: "mês atual",
      startExpr: `datetime('now', 'start of month')`,
    };
  }
  if (p === "all" || p === "tudo") {
    return { clause: "1=1", label: "tudo", startExpr: `'1970-01-01'` };
  }
  // default 30d
  return {
    clause: `${column} >= datetime('now', '-30 days')`,
    label: "30 dias",
    startExpr: `datetime('now', '-30 days')`,
  };
}

async function closeOpenDriverSessions(env, driverId) {
  await env.DB.prepare(
    `UPDATE driver_online_sessions SET ended_at = datetime('now')
     WHERE driver_id = ? AND ended_at IS NULL`
  )
    .bind(driverId)
    .run();
}

async function openDriverSession(env, driverId) {
  await closeOpenDriverSessions(env, driverId);
  await env.DB.prepare(
    `INSERT INTO driver_online_sessions (id, driver_id, started_at) VALUES (?, ?, datetime('now'))`
  )
    .bind(id(), driverId)
    .run();
}

async function buildDriverStats(env, driverId, period = "today") {
  const pf = periodSqlFilter(period, "completed_at");
  const pfCreated = periodSqlFilter(period, "created_at");

  const finance = await env.DB.prepare(
    `SELECT
       COUNT(*) AS completed_n,
       IFNULL(SUM(IFNULL(fare_final, fare_estimate)), 0) AS revenue,
       IFNULL(AVG(IFNULL(fare_final, fare_estimate)), 0) AS ticket_avg,
       IFNULL(SUM(
         CASE
           WHEN accepted_at IS NOT NULL AND completed_at IS NOT NULL
           THEN (julianday(completed_at) - julianday(accepted_at)) * 24.0
           ELSE 0
         END
       ), 0) AS trip_hours
     FROM rides
     WHERE driver_id = ?
       AND status = 'completed'
       AND ${pf.clause}`
  )
    .bind(driverId)
    .first();

  const cancelled = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rides
     WHERE driver_id = ?
       AND status = 'cancelled'
       AND IFNULL(cancel_reason,'') != 'expired'
       AND ${pfCreated.clause}`
  )
    .bind(driverId)
    .first();

  const hoursRow = await env.DB.prepare(
    `SELECT IFNULL(SUM(
       MAX(0,
         (julianday(IFNULL(ended_at, datetime('now'))) - julianday(
           CASE WHEN started_at < ${pf.startExpr} THEN ${pf.startExpr} ELSE started_at END
         )) * 24.0
       )
     ), 0) AS hours
     FROM driver_online_sessions
     WHERE driver_id = ?
       AND started_at <= datetime('now')
       AND (ended_at IS NULL OR ended_at >= ${pf.startExpr})`
  )
    .bind(driverId)
    .first();

  let hoursOnline = Number(hoursRow?.hours || 0);
  if (!Number.isFinite(hoursOnline) || hoursOnline < 0) hoursOnline = 0;
  hoursOnline = Math.round(hoursOnline * 100) / 100;

  const revenue = Math.round(Number(finance?.revenue || 0) * 100) / 100;
  const completed = Number(finance?.completed_n || 0);
  const ticketAvg = Math.round(Number(finance?.ticket_avg || 0) * 100) / 100;
  const tripHours = Math.round(Number(finance?.trip_hours || 0) * 100) / 100;
  const perHourOnline =
    hoursOnline > 0.05 ? Math.round((revenue / hoursOnline) * 100) / 100 : null;
  const perHourTrip =
    tripHours > 0.05 ? Math.round((revenue / tripHours) * 100) / 100 : null;

  const recent = await env.DB.prepare(
    `SELECT id, status, dest_address, origin_address,
            IFNULL(fare_final, fare_estimate) AS fare,
            created_at, accepted_at, completed_at
     FROM rides
     WHERE driver_id = ? AND status = 'completed' AND ${pf.clause}
     ORDER BY completed_at DESC
     LIMIT 20`
  )
    .bind(driverId)
    .all();

  return {
    period: pf.label,
    period_key: period,
    completed,
    cancelled: Number(cancelled?.n || 0),
    revenue,
    ticket_avg: ticketAvg,
    hours_online: hoursOnline,
    trip_hours: tripHours,
    earnings_per_hour: perHourOnline,
    earnings_per_trip_hour: perHourTrip,
    recent_rides: (recent.results || []).map((r) => ({
      id: r.id,
      fare: Math.round(Number(r.fare || 0) * 100) / 100,
      dest_address: r.dest_address,
      origin_address: r.origin_address,
      completed_at: r.completed_at,
    })),
  };
}

async function buildAdminSummary(env, period = "30d") {
  const pf = periodSqlFilter(period, "created_at");
  const passengers = await env.DB.prepare("SELECT COUNT(*) AS n FROM passengers").first();
  const drivers = await env.DB.prepare("SELECT COUNT(*) AS n FROM drivers").first();
  const online = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM drivers WHERE is_online = 1 AND IFNULL(is_blocked,0) = 0"
  ).first();

  const byStatus = await env.DB.prepare(
    `SELECT status, IFNULL(cancel_reason,'') AS cancel_reason, COUNT(*) AS n
     FROM rides WHERE ${pf.clause}
     GROUP BY status, IFNULL(cancel_reason,'')`
  ).all();

  const counts = {
    searching: 0,
    accepted: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    expired: 0,
    total: 0,
  };
  for (const row of byStatus.results || []) {
    const n = Number(row.n) || 0;
    counts.total += n;
    if (row.status === "cancelled" && row.cancel_reason === "expired") counts.expired += n;
    else if (counts[row.status] != null) counts[row.status] += n;
  }

  const ridesToday = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rides WHERE created_at >= datetime('now', 'start of day')`
  ).first();
  const ridesWeek = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rides WHERE created_at >= datetime('now', '-7 days')`
  ).first();
  const ridesAll = await env.DB.prepare(`SELECT COUNT(*) AS n FROM rides`).first();

  const avgAccept = await env.DB.prepare(
    `SELECT AVG(
       (julianday(accepted_at) - julianday(created_at)) * 86400.0
     ) AS sec
     FROM rides
     WHERE accepted_at IS NOT NULL AND ${pf.clause}`
  ).first();

  const finance = await env.DB.prepare(
    `SELECT
       COUNT(*) AS completed_n,
       IFNULL(SUM(IFNULL(fare_final, fare_estimate)), 0) AS revenue,
       IFNULL(AVG(IFNULL(fare_final, fare_estimate)), 0) AS ticket_avg
     FROM rides
     WHERE status = 'completed' AND ${pf.clause}`
  ).first();

  const cancelledN = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rides
     WHERE status = 'cancelled' AND IFNULL(cancel_reason,'') != 'expired' AND ${pf.clause}`
  ).first();

  const daily = await env.DB.prepare(
    `SELECT date(created_at) AS day,
            COUNT(*) AS rides,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'completed' THEN IFNULL(fare_final, fare_estimate) ELSE 0 END) AS revenue
     FROM rides
     WHERE ${pf.clause}
     GROUP BY date(created_at)
     ORDER BY day ASC
     LIMIT 62`
  ).all();

  return {
    period: pf.label,
    period_key: period,
    passengers: passengers?.n || 0,
    drivers: drivers?.n || 0,
    drivers_online: online?.n || 0,
    rides_today: ridesToday?.n || 0,
    rides_week: ridesWeek?.n || 0,
    rides_total: ridesAll?.n || 0,
    rides_searching: counts.searching,
    rides_active: counts.accepted + counts.in_progress,
    by_status: counts,
    avg_accept_seconds:
      avgAccept?.sec != null && !Number.isNaN(Number(avgAccept.sec))
        ? Math.round(Number(avgAccept.sec) * 10) / 10
        : null,
    finance: {
      completed: finance?.completed_n || 0,
      cancelled: cancelledN?.n || 0,
      expired: counts.expired,
      revenue: Math.round(Number(finance?.revenue || 0) * 100) / 100,
      ticket_avg: Math.round(Number(finance?.ticket_avg || 0) * 100) / 100,
    },
    daily: (daily.results || []).map((d) => ({
      day: d.day,
      rides: d.rides || 0,
      completed: d.completed || 0,
      revenue: Math.round(Number(d.revenue || 0) * 100) / 100,
    })),
  };
}

async function buildDriverReports(env, period = "30d") {
  const pf = periodSqlFilter(period, "r.created_at");
  const { results } = await env.DB.prepare(
    `SELECT
       d.id AS driver_id,
       d.name,
       d.colete,
       d.plate,
       d.is_online,
       d.is_blocked,
       COUNT(r.id) AS rides_total,
       SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN r.status = 'cancelled' AND IFNULL(r.cancel_reason,'') != 'expired' THEN 1 ELSE 0 END) AS cancelled,
       SUM(CASE WHEN r.status = 'cancelled' AND r.cancel_reason = 'expired' THEN 1 ELSE 0 END) AS expired,
       SUM(CASE WHEN r.status IN ('accepted','in_progress') THEN 1 ELSE 0 END) AS active,
       IFNULL(SUM(CASE WHEN r.status = 'completed' THEN IFNULL(r.fare_final, r.fare_estimate) ELSE 0 END), 0) AS revenue,
       IFNULL(AVG(CASE WHEN r.status = 'completed' THEN IFNULL(r.fare_final, r.fare_estimate) END), 0) AS ticket_avg
     FROM drivers d
     LEFT JOIN rides r ON r.driver_id = d.id AND ${pf.clause}
     GROUP BY d.id
     ORDER BY revenue DESC, completed DESC, d.name ASC`
  ).all();

  return (results || []).map((row, idx) => ({
    rank: idx + 1,
    driver_id: row.driver_id,
    name: row.name,
    colete: row.colete,
    plate: row.plate,
    is_online: row.is_online,
    is_blocked: row.is_blocked,
    rides_total: row.rides_total || 0,
    completed: row.completed || 0,
    cancelled: row.cancelled || 0,
    expired: row.expired || 0,
    active: row.active || 0,
    revenue: Math.round(Number(row.revenue || 0) * 100) / 100,
    ticket_avg: Math.round(Number(row.ticket_avg || 0) * 100) / 100,
  }));
}

function requireAdmin(request, env, origin) {
  const expected = String(env.ADMIN_PASSWORD || "").trim();
  if (!expected) {
    return json(
      { error: "ADMIN_PASSWORD não configurada no Worker" },
      503,
      origin
    );
  }
  const got = String(request.headers.get("X-Admin-Password") || "").trim();
  if (got !== expected) {
    return json({ error: "senha admin inválida" }, 401, origin);
  }
  return null;
}

async function upsertPassenger(env, { deviceId, name, phone }) {
  const phoneNorm = normalizePhoneBr(phone);
  const existing = await env.DB.prepare("SELECT * FROM passengers WHERE device_id = ?")
    .bind(deviceId)
    .first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE passengers SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(name, phoneNorm, existing.id)
      .run();
    return env.DB.prepare("SELECT * FROM passengers WHERE id = ?").bind(existing.id).first();
  }

  const passengerId = id();
  await env.DB.prepare(
    `INSERT INTO passengers (id, device_id, name, phone) VALUES (?, ?, ?, ?)`
  )
    .bind(passengerId, deviceId, name, phoneNorm)
    .run();
  return env.DB.prepare("SELECT * FROM passengers WHERE id = ?").bind(passengerId).first();
}

function publicPassenger(row) {
  if (!row) return null;
  return {
    ...row,
    phone_display: formatPhoneBr(row.phone),
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    try {
      if (method === "GET" && (path === "/" || path === "/api/health")) {
        return json({ ok: true, service: "mototaxi-api", ts: new Date().toISOString() }, 200, origin);
      }

      // POST /api/passengers — register / upsert
      if (method === "POST" && path === "/api/passengers") {
        const body = await readBody(request);
        const deviceId = String(body.device_id || "").trim();
        const name = String(body.name || "").trim().slice(0, 80);
        const phone = String(body.phone || "").trim();
        if (!deviceId) return json({ error: "device_id obrigatório" }, 400, origin);
        if (name.length < 2) return json({ error: "nome obrigatório" }, 400, origin);
        if (!isValidPhoneBr(phone)) {
          return json({ error: "telefone inválido — use DDD + número (10 ou 11 dígitos)" }, 400, origin);
        }
        const passenger = await upsertPassenger(env, { deviceId, name, phone });
        return json({ passenger: publicPassenger(passenger) }, 200, origin);
      }

      // GET /api/passengers/me?device_id=
      if (method === "GET" && path === "/api/passengers/me") {
        const deviceId = String(url.searchParams.get("device_id") || "").trim();
        if (!deviceId) return json({ error: "device_id obrigatório" }, 400, origin);
        const passenger = await env.DB.prepare("SELECT * FROM passengers WHERE device_id = ?")
          .bind(deviceId)
          .first();
        if (!passenger) return json({ passenger: null }, 200, origin);
        return json({ passenger: publicPassenger(passenger) }, 200, origin);
      }

      // POST /api/drivers — register / upsert by device_id
      if (method === "POST" && path === "/api/drivers") {
        const body = await readBody(request);
        const deviceId = String(body.device_id || "").trim();
        if (!deviceId) return json({ error: "device_id obrigatório" }, 400, origin);

        const name = String(body.name || "Mototaxista").slice(0, 80);
        const colete = String(body.colete || "032").slice(0, 8);
        const plate = String(body.plate || "").slice(0, 12);
        const vehicle = String(body.vehicle || "Honda 160").slice(0, 40);

        const existing = await env.DB.prepare("SELECT * FROM drivers WHERE device_id = ?")
          .bind(deviceId)
          .first();

        if (existing) {
          await env.DB.prepare(
            `UPDATE drivers SET name = ?, colete = ?, plate = ?, vehicle = ?, updated_at = datetime('now') WHERE id = ?`
          )
            .bind(name, colete, plate, vehicle, existing.id)
            .run();
          const row = await env.DB.prepare("SELECT * FROM drivers WHERE id = ?")
            .bind(existing.id)
            .first();
          return json({ driver: row }, 200, origin);
        }

        const driverId = id();
        await env.DB.prepare(
          `INSERT INTO drivers (id, device_id, name, colete, plate, vehicle, is_online, is_blocked)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
        )
          .bind(driverId, deviceId, name, colete, plate, vehicle)
          .run();
        const row = await env.DB.prepare("SELECT * FROM drivers WHERE id = ?")
          .bind(driverId)
          .first();
        return json({ driver: row }, 201, origin);
      }

      // PATCH /api/drivers/:id/status
      {
        const m = path.match(/^\/api\/drivers\/([^/]+)\/status$/);
        if (method === "PATCH" && m) {
          const driverId = m[1];
          const body = await readBody(request);
          const isOnline = body.online === true || body.online === 1 || body.is_online === 1 ? 1 : 0;
          const lat = body.lat != null ? Number(body.lat) : null;
          const lng = body.lng != null ? Number(body.lng) : null;

          const current = await env.DB.prepare("SELECT * FROM drivers WHERE id = ?")
            .bind(driverId)
            .first();
          if (!current) return json({ error: "motorista não encontrado" }, 404, origin);
          if (isOnline && current.is_blocked) {
            return json({ error: "motorista bloqueado pelo admin" }, 403, origin);
          }

          const wasOnline = Number(current.is_online) === 1;

          if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
            await env.DB.prepare(
              `UPDATE drivers SET is_online = ?, lat = ?, lng = ?, updated_at = datetime('now') WHERE id = ?`
            )
              .bind(isOnline, lat, lng, driverId)
              .run();
          } else {
            await env.DB.prepare(
              `UPDATE drivers SET is_online = ?, updated_at = datetime('now') WHERE id = ?`
            )
              .bind(isOnline, driverId)
              .run();
          }

          if (isOnline && !wasOnline) {
            await openDriverSession(env, driverId);
          } else if (!isOnline && wasOnline) {
            await closeOpenDriverSessions(env, driverId);
          }

          const row = await env.DB.prepare("SELECT * FROM drivers WHERE id = ?")
            .bind(driverId)
            .first();
          return json({ driver: row }, 200, origin);
        }
      }

      // GET /api/drivers/:id/stats?period=today|7d|30d|month
      {
        const m = path.match(/^\/api\/drivers\/([^/]+)\/stats$/);
        if (method === "GET" && m) {
          const driverId = m[1];
          const driver = await env.DB.prepare("SELECT id, name, colete FROM drivers WHERE id = ?")
            .bind(driverId)
            .first();
          if (!driver) return json({ error: "motorista não encontrado" }, 404, origin);
          const period = url.searchParams.get("period") || "today";
          const stats = await buildDriverStats(env, driverId, period);
          return json({ driver, stats }, 200, origin);
        }
      }

      // PATCH /api/drivers/:id/location
      {
        const m = path.match(/^\/api\/drivers\/([^/]+)\/location$/);
        if (method === "PATCH" && m) {
          const driverId = m[1];
          const body = await readBody(request);
          const lat = Number(body.lat);
          const lng = Number(body.lng);
          if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return json({ error: "lat/lng inválidos" }, 400, origin);
          }
          await env.DB.prepare(
            `UPDATE drivers SET lat = ?, lng = ?, updated_at = datetime('now') WHERE id = ?`
          )
            .bind(lat, lng, driverId)
            .run();
          return json({ ok: true, lat, lng, ts: Date.now() }, 200, origin);
        }
      }

      // GET /api/drivers/nearby
      if (method === "GET" && path === "/api/drivers/nearby") {
        const lat = Number(url.searchParams.get("lat"));
        const lng = Number(url.searchParams.get("lng"));
        const radiusKm = Number(url.searchParams.get("radius_km") || 15);

        const { results } = await env.DB.prepare(
          `SELECT id, name, colete, plate, vehicle, lat, lng, updated_at
           FROM drivers
           WHERE is_online = 1
             AND IFNULL(is_blocked, 0) = 0
             AND lat IS NOT NULL AND lng IS NOT NULL`
        ).all();

        let drivers = results || [];
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          drivers = drivers
            .map((d) => ({
              ...d,
              distance_km: Math.round(haversineKm(lat, lng, d.lat, d.lng) * 100) / 100,
              ts: Date.parse(d.updated_at + "Z") || Date.now(),
            }))
            .filter((d) => d.distance_km <= radiusKm)
            .sort((a, b) => a.distance_km - b.distance_km);
        } else {
          drivers = drivers.map((d) => ({
            ...d,
            ts: Date.parse(d.updated_at + "Z") || Date.now(),
          }));
        }

        return json({ drivers, count: drivers.length }, 200, origin);
      }

      // POST /api/rides
      if (method === "POST" && path === "/api/rides") {
        const body = await readBody(request);
        const passengerDeviceId = String(body.passenger_device_id || "").trim();
        if (!passengerDeviceId) {
          return json({ error: "passenger_device_id obrigatório" }, 400, origin);
        }

        const originLat = Number(body.origin_lat);
        const originLng = Number(body.origin_lng);
        const destLat = Number(body.dest_lat ?? originLat);
        const destLng = Number(body.dest_lng ?? originLng);
        if (Number.isNaN(originLat) || Number.isNaN(originLng)) {
          return json({ error: "origem lat/lng obrigatória" }, 400, origin);
        }

        let passengerName = String(body.passenger_name || "").trim().slice(0, 80);
        let passengerPhone = String(body.passenger_phone || "").trim();
        let passengerId = null;

        let passenger = await env.DB.prepare("SELECT * FROM passengers WHERE device_id = ?")
          .bind(passengerDeviceId)
          .first();

        if (!passenger) {
          if (passengerName.length < 2 || !isValidPhoneBr(passengerPhone)) {
            return json(
              { error: "cadastre nome e telefone antes de chamar a corrida" },
              400,
              origin
            );
          }
          passenger = await upsertPassenger(env, {
            deviceId: passengerDeviceId,
            name: passengerName,
            phone: passengerPhone,
          });
        }

        passengerId = passenger.id;
        passengerName = passenger.name;
        passengerPhone = passenger.phone;

        await env.DB.prepare(
          `UPDATE rides SET status = 'cancelled', cancel_reason = 'superseded'
           WHERE passenger_device_id = ? AND status = 'searching'`
        )
          .bind(passengerDeviceId)
          .run();

        const rideId = id();
        const destAddress = String(body.dest_address || "Destino em Carmo").slice(0, 120);
        const originAddress = String(body.origin_address || "Sua localização").slice(0, 120);
        const fare = Number(body.fare_estimate ?? 6);

        await env.DB.prepare(
          `INSERT INTO rides (
             id, passenger_device_id, passenger_id, passenger_name, passenger_phone, status,
             origin_lat, origin_lng, origin_address,
             dest_lat, dest_lng, dest_address, fare_estimate
           ) VALUES (?, ?, ?, ?, ?, 'searching', ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            rideId,
            passengerDeviceId,
            passengerId,
            passengerName,
            passengerPhone,
            originLat,
            originLng,
            originAddress,
            destLat,
            destLng,
            destAddress,
            fare
          )
          .run();

        const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
          .bind(rideId)
          .first();
        return json({ ride: withRideExpiry(ride) }, 201, origin);
      }

      // GET /api/rides/pending
      if (method === "GET" && path === "/api/rides/pending") {
        await expireStaleSearchingRides(env);
        const { results } = await env.DB.prepare(
          `SELECT * FROM rides WHERE status = 'searching' ORDER BY created_at ASC LIMIT 20`
        ).all();
        return json({ rides: (results || []).map(withRideExpiry) }, 200, origin);
      }

      // GET /api/rides/:id
      {
        const m = path.match(/^\/api\/rides\/([^/]+)$/);
        if (method === "GET" && m) {
          const rideId = m[1];
          await expireStaleSearchingRides(env);
          const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
            .bind(rideId)
            .first();
          if (!ride) return json({ error: "corrida não encontrada" }, 404, origin);

          let driver = null;
          if (ride.driver_id) {
            driver = await env.DB.prepare(
              "SELECT id, name, colete, plate, vehicle, lat, lng, is_online, updated_at FROM drivers WHERE id = ?"
            )
              .bind(ride.driver_id)
              .first();
          }
          return json({ ride: withRideExpiry(ride), driver }, 200, origin);
        }
      }

      // PATCH /api/rides/:id/accept — first driver wins
      {
        const m = path.match(/^\/api\/rides\/([^/]+)\/accept$/);
        if (method === "PATCH" && m) {
          const rideId = m[1];
          const body = await readBody(request);
          const driverId = String(body.driver_id || "").trim();
          if (!driverId) return json({ error: "driver_id obrigatório" }, 400, origin);

          await expireStaleSearchingRides(env);

          const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
            .bind(rideId)
            .first();
          if (!ride) return json({ error: "corrida não encontrada" }, 404, origin);
          if (ride.status !== "searching") {
            return json(
              {
                error:
                  ride.status === "cancelled"
                    ? "tempo esgotado — corrida expirada"
                    : "corrida não está disponível",
                ride: withRideExpiry(ride),
              },
              409,
              origin
            );
          }

          const driver = await env.DB.prepare("SELECT * FROM drivers WHERE id = ?")
            .bind(driverId)
            .first();
          if (!driver) return json({ error: "motorista não encontrado" }, 404, origin);
          if (driver.is_blocked) {
            return json({ error: "motorista bloqueado pelo admin" }, 403, origin);
          }

          await env.DB.prepare(
            `UPDATE rides SET status = 'accepted', driver_id = ?, accepted_at = datetime('now') WHERE id = ? AND status = 'searching'`
          )
            .bind(driverId, rideId)
            .run();

          const updated = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
            .bind(rideId)
            .first();
          if (updated.status !== "accepted" || updated.driver_id !== driverId) {
            return json({ error: "outro motorista aceitou primeiro", ride: updated }, 409, origin);
          }
          return json({ ride: withRideExpiry(updated), driver }, 200, origin);
        }
      }

      // PATCH /api/rides/:id/start
      {
        const m = path.match(/^\/api\/rides\/([^/]+)\/start$/);
        if (method === "PATCH" && m) {
          const rideId = m[1];
          await env.DB.prepare(
            `UPDATE rides SET status = 'in_progress' WHERE id = ? AND status = 'accepted'`
          )
            .bind(rideId)
            .run();
          const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
            .bind(rideId)
            .first();
          if (!ride) return json({ error: "corrida não encontrada" }, 404, origin);
          return json({ ride: withRideExpiry(ride) }, 200, origin);
        }
      }

      // PATCH /api/rides/:id/complete
      {
        const m = path.match(/^\/api\/rides\/([^/]+)\/complete$/);
        if (method === "PATCH" && m) {
          const rideId = m[1];
          await env.DB.prepare(
            `UPDATE rides
             SET status = 'completed',
                 completed_at = datetime('now'),
                 fare_final = IFNULL(fare_final, IFNULL(fare_estimate, 6))
             WHERE id = ? AND status IN ('accepted', 'in_progress')`
          )
            .bind(rideId)
            .run();
          const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
            .bind(rideId)
            .first();
          if (!ride) return json({ error: "corrida não encontrada" }, 404, origin);
          return json({ ride: withRideExpiry(ride) }, 200, origin);
        }
      }

      // PATCH /api/rides/:id/cancel
      {
        const m = path.match(/^\/api\/rides\/([^/]+)\/cancel$/);
        if (method === "PATCH" && m) {
          const rideId = m[1];
          await env.DB.prepare(
            `UPDATE rides SET status = 'cancelled', cancel_reason = 'user'
             WHERE id = ? AND status IN ('searching', 'accepted', 'in_progress')`
          )
            .bind(rideId)
            .run();
          const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
            .bind(rideId)
            .first();
          if (!ride) return json({ error: "corrida não encontrada" }, 404, origin);
          return json({ ride: withRideExpiry(ride) }, 200, origin);
        }
      }

      // ——— Admin ———
      if (path.startsWith("/api/admin")) {
        const denied = requireAdmin(request, env, origin);
        if (denied) return denied;

        if (method === "GET" && path === "/api/admin/summary") {
          await expireStaleSearchingRides(env);
          const period = String(url.searchParams.get("period") || "30d");
          const summary = await buildAdminSummary(env, period);
          return json(summary, 200, origin);
        }

        if (method === "GET" && path === "/api/admin/driver-reports") {
          await expireStaleSearchingRides(env);
          const period = String(url.searchParams.get("period") || "30d");
          const drivers = await buildDriverReports(env, period);
          return json({ period, drivers }, 200, origin);
        }

        if (method === "GET" && path === "/api/admin/passengers") {
          const q = String(url.searchParams.get("q") || "").trim();
          const like = `%${q}%`;
          const { results } = q
            ? await env.DB.prepare(
                `SELECT * FROM passengers
                 WHERE name LIKE ? OR phone LIKE ? OR device_id LIKE ?
                 ORDER BY created_at DESC LIMIT 100`
              )
                .bind(like, like, like)
                .all()
            : await env.DB.prepare(
                `SELECT * FROM passengers ORDER BY created_at DESC LIMIT 100`
              ).all();
          return json(
            { passengers: (results || []).map(publicPassenger) },
            200,
            origin
          );
        }

        if (method === "GET" && path === "/api/admin/drivers") {
          const q = String(url.searchParams.get("q") || "").trim();
          const like = `%${q}%`;
          const { results } = q
            ? await env.DB.prepare(
                `SELECT * FROM drivers
                 WHERE name LIKE ? OR colete LIKE ? OR plate LIKE ? OR device_id LIKE ?
                 ORDER BY updated_at DESC LIMIT 100`
              )
                .bind(like, like, like, like)
                .all()
            : await env.DB.prepare(
                `SELECT * FROM drivers ORDER BY updated_at DESC LIMIT 100`
              ).all();
          return json({ drivers: results || [] }, 200, origin);
        }

        if (method === "GET" && path === "/api/admin/rides") {
          await expireStaleSearchingRides(env);
          const q = String(url.searchParams.get("q") || "").trim();
          const status = String(url.searchParams.get("status") || "").trim();
          const period = String(url.searchParams.get("period") || "30d");
          const pf = periodSqlFilter(period, "created_at");
          const like = `%${q}%`;
          let sql = `SELECT * FROM rides WHERE ${pf.clause}`;
          const binds = [];
          if (status === "expired") {
            sql += ` AND status = 'cancelled' AND cancel_reason = 'expired'`;
          } else if (status === "cancelled") {
            sql += ` AND status = 'cancelled' AND IFNULL(cancel_reason,'') != 'expired'`;
          } else if (status) {
            sql += ` AND status = ?`;
            binds.push(status);
          }
          if (q) {
            sql += ` AND (passenger_name LIKE ? OR passenger_phone LIKE ? OR origin_address LIKE ? OR dest_address LIKE ? OR id LIKE ?)`;
            binds.push(like, like, like, like, like);
          }
          sql += ` ORDER BY created_at DESC LIMIT 200`;
          const stmt = env.DB.prepare(sql);
          const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
          return json({ rides: (results || []).map(withRideExpiry), period: pf.label }, 200, origin);
        }

        {
          const m = path.match(/^\/api\/admin\/rides\/([^/]+)\/cancel$/);
          if (method === "PATCH" && m) {
            const rideId = m[1];
            await env.DB.prepare(
              `UPDATE rides SET status = 'cancelled', cancel_reason = 'admin'
               WHERE id = ? AND status IN ('searching','accepted','in_progress')`
            )
              .bind(rideId)
              .run();
            const ride = await env.DB.prepare("SELECT * FROM rides WHERE id = ?")
              .bind(rideId)
              .first();
            if (!ride) return json({ error: "corrida não encontrada" }, 404, origin);
            return json({ ride: withRideExpiry(ride) }, 200, origin);
          }
        }

        {
          const m = path.match(/^\/api\/admin\/drivers\/([^/]+)\/block$/);
          if (method === "PATCH" && m) {
            const driverId = m[1];
            const body = await readBody(request);
            const blocked =
              body.blocked === true || body.blocked === 1 || body.is_blocked === 1 ? 1 : 0;
            await env.DB.prepare(
              `UPDATE drivers SET is_blocked = ?, is_online = CASE WHEN ? = 1 THEN 0 ELSE is_online END,
               updated_at = datetime('now') WHERE id = ?`
            )
              .bind(blocked, blocked, driverId)
              .run();
            const driver = await env.DB.prepare("SELECT * FROM drivers WHERE id = ?")
              .bind(driverId)
              .first();
            if (!driver) return json({ error: "motorista não encontrado" }, 404, origin);
            return json({ driver }, 200, origin);
          }
        }

        return json({ error: "rota admin não encontrada", path }, 404, origin);
      }

      return json({ error: "rota não encontrada", path }, 404, origin);
    } catch (err) {
      console.error(err);
      return json({ error: "erro interno", detail: String(err?.message || err) }, 500, origin);
    }
  },
};
