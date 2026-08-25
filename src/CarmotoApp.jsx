import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Star,
  Phone,
  Power,
  Bell,
  Clock,
  Wallet,
  X,
  Check,
  ChevronDown,
  Navigation,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, getDeviceId, loadPassengerProfile, savePassengerProfile } from "./api";
import AdminApp from "./AdminApp";

/* Paleta: branco (#FFF/#FAFAFA) · vermelho (#E11D2E) · charcoal (#111) + muted #6B7280 */
const C = {
  asphalt: "#FAFAFA",
  asphalt2: "#FFFFFF",
  panel: "#F3F4F6",
  paper: "#FFFFFF",
  paperSoft: "#F3F4F6",
  vest: "#E11D2E",
  vestDeep: "#B91C1C",
  red: "#E11D2E",
  serra: "#111111",
  ink: "#111111",
  inkSoft: "#6B7280",
  line: "rgba(17,17,17,0.08)",
  white: "#FFFFFF",
};

const FONT = "'DM Sans', system-ui, sans-serif";
const DISPLAY = "'Space Grotesk', 'DM Sans', system-ui, sans-serif";

function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function normalizePhoneBr(raw) {
  let d = digitsOnly(raw);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d;
}

function isValidPhoneBr(raw) {
  const d = normalizePhoneBr(raw);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

function formatPhoneBr(raw) {
  const d = normalizePhoneBr(raw);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(raw || "");
}

function googleMapsNavUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

function wazeNavUrl(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=true`;
}

function NavExternalButtons({ lat, lng, label = "Navegar até" }) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return null;
  }
  const la = Number(lat);
  const ln = Number(lng);
  return (
    <div className="mb-3">
      <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
        {label}
      </p>
      <div className="flex gap-2">
        <a
          href={googleMapsNavUrl(la, ln)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 no-underline"
          style={{
            background: C.ink,
            color: C.white,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 12.5,
          }}
        >
          <Navigation size={14} />
          Maps
        </a>
        <a
          href={wazeNavUrl(la, ln)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 no-underline"
          style={{
            background: C.panel,
            color: C.ink,
            border: `1px solid ${C.line}`,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 12.5,
          }}
        >
          <Navigation size={14} />
          Waze
        </a>
      </div>
    </div>
  );
}

function MotoMark({ size = 26, color = C.ink }) {
  return (
    <svg width={size} height={size * (32 / 48)} viewBox="0 0 48 32" fill="none">
      <circle cx="9" cy="25" r="5.5" stroke={color} strokeWidth="2.5" />
      <circle cx="39" cy="25" r="5.5" stroke={color} strokeWidth="2.5" />
      <path
        d="M9 25 L18 14 L28 14 L33 25"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M18 14 L15 8 H21"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <line x1="28" y1="14" x2="39" y2="25" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="28" cy="10.5" r="3" fill={color} />
    </svg>
  );
}

function ColeteBadge({ number, size = "md" }) {
  const dims =
    size === "lg" ? { w: 76, h: 76, fs: 20 } : size === "sm" ? { w: 34, h: 34, fs: 10 } : { w: 52, h: 52, fs: 14 };
  return (
    <div
      style={{
        width: dims.w,
        height: dims.h,
        background: C.vest,
        border: `2px solid ${C.vestDeep}`,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "none",
      }}
    >
      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: dims.fs, color: C.white }}>
        #{number}
      </span>
    </div>
  );
}

function Stars({ value, onChange, size = 26 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => onChange && onChange(i)}
          className="transition-transform active:scale-90"
          style={{ lineHeight: 0 }}
        >
          <Star
            size={size}
            color={C.vestDeep}
            fill={i <= value ? C.vest : "transparent"}
            strokeWidth={1.75}
          />
        </button>
      ))}
    </div>
  );
}

function RouteMap({ mode = "search" }) {
  return (
    <div
      style={{ background: C.panel, borderRadius: 18, position: "relative", overflow: "hidden", height: 190, border: `1px solid ${C.line}` }}
    >
      <svg width="100%" height="100%" viewBox="0 0 320 190" preserveAspectRatio="none">
        <line x1="0" y1="150" x2="320" y2="40" stroke="rgba(17,17,17,0.06)" strokeWidth="10" />
        <line x1="40" y1="0" x2="150" y2="190" stroke="rgba(17,17,17,0.05)" strokeWidth="8" />
        <path
          d="M30 160 C 90 120, 140 130, 180 90 S 260 40, 290 35"
          stroke={C.vest}
          strokeWidth="3.5"
          strokeDasharray="1 10"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div style={{ position: "absolute", left: 22, bottom: 24 }}>
        <MapPin size={22} color={C.red} fill={C.white} />
      </div>
      <div style={{ position: "absolute", right: 26, top: 28 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: C.vest,
            border: `2px solid ${C.ink}`,
          }}
        />
      </div>
      {mode === "search" && (
        <>
          <span className="absolute rounded-full animate-ping" style={{ left: 22, bottom: 24, width: 14, height: 14, background: "rgba(225,29,46,0.35)" }} />
        </>
      )}
    </div>
  );
}

function NearbyMotoMap() {
  const motos = [
    { top: "22%", left: "70%", delay: "0s", dur: "3.4s" },
    { top: "60%", left: "18%", delay: "0.5s", dur: "3s" },
    { top: "74%", left: "64%", delay: "1s", dur: "3.8s" },
    { top: "34%", left: "36%", delay: "1.4s", dur: "3.2s" },
    { top: "14%", left: "28%", delay: "0.8s", dur: "3.6s" },
  ];
  return (
    <div style={{ position: "relative", height: 170, borderRadius: 18, overflow: "hidden", background: C.asphalt }}>
      <svg width="100%" height="100%" viewBox="0 0 320 170" preserveAspectRatio="none">
        <line x1="0" y1="40" x2="320" y2="40" stroke="rgba(17,17,17,0.06)" strokeWidth="7" />
        <line x1="0" y1="120" x2="320" y2="100" stroke="rgba(17,17,17,0.06)" strokeWidth="7" />
        <line x1="70" y1="0" x2="70" y2="170" stroke="rgba(17,17,17,0.05)" strokeWidth="6" />
        <line x1="230" y1="0" x2="200" y2="170" stroke="rgba(17,17,17,0.05)" strokeWidth="6" />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,255,255,0.92)",
          padding: "4px 9px",
          borderRadius: 999,
        }}
      >
        <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: C.vest }} />
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.ink }}>
          5 mototáxis por perto
        </span>
      </div>

      <div style={{ position: "absolute", top: "50%", left: "50%" }}>
        <span
          className="absolute animate-ping"
          style={{ width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 999, background: "rgba(225,29,46,0.2)" }}
        />
        <div style={{ width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 999, background: C.paper, border: `2px solid ${C.ink}` }} />
      </div>

      {motos.map((m, i) => (
        <div
          key={i}
          className="absolute moto-drift"
          style={{ top: m.top, left: m.left, animationDelay: m.delay, animationDuration: m.dur }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              background: C.vest,
              border: `1.5px solid ${C.vestDeep}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            <MotoMark size={13} color={C.white} />
          </div>
        </div>
      ))}
    </div>
  );
}

const CARMO_CENTER = { lat: -21.9339, lng: -42.6089 };

const DEST_LANDMARKS = {
  "Praça Getúlio Vargas": { lat: -21.9339, lng: -42.6089 },
  Rodoviária: { lat: -21.9365, lng: -42.605 },
  "Hospital Municipal": { lat: -21.931, lng: -42.612 },
  "Mercado Central": { lat: -21.9348, lng: -42.6075 },
};

function formatCoords(lat, lng, digits = 5) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return "Localização indisponível";
  }
  return `${Number(lat).toFixed(digits)}, ${Number(lng).toFixed(digits)}`;
}

function haversineKmClient(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pinIcon(color, label, size = 28) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-4px)">
      <div style="min-width:${size}px;height:${size}px;padding:0 6px;border-radius:999px;background:${color};border:2px solid #111111;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;font-size:10px;font-weight:700;color:#111111;box-shadow:0 1px 4px rgba(17,17,17,0.12)">${label}</div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-1px"></div>
    </div>`,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 8],
  });
}

function youDotIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:999px;background:#fff;border:3px solid #E11D2E;box-shadow:0 0 0 5px rgba(225,29,46,0.18)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const ACCEPT_WINDOW_SEC = 15;
const ACCEPT_WINDOW_MS = ACCEPT_WINDOW_SEC * 1000;

function parseRideCreatedMs(createdAt) {
  if (!createdAt) return Date.now();
  const raw = String(createdAt);
  const hasTz = /Z|[+-]\d{2}:?\d{2}$/i.test(raw);
  const ms = Date.parse(hasTz ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(ms) ? Date.now() : ms;
}

function remainingAcceptMs(ride) {
  if (!ride) return 0;
  return Math.max(0, ACCEPT_WINDOW_MS - (Date.now() - parseRideCreatedMs(ride.created_at)));
}

async function reverseGeocodeLabel(lat, lng) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
      {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const street = a.road || a.pedestrian || a.neighbourhood || a.suburb;
    const ref = a.city || a.town || a.village || a.municipality || "Carmo";
    if (street) return `${street} · ${ref}`;
    if (data.name) return `${data.name} · ${ref}`;
    return null;
  } catch {
    return null;
  }
}

/** Geocode leve (Nominatim) centrado em Carmo; fallback null se falhar. */
async function geocodeDestination(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const params = new URLSearchParams({
      format: "jsonv2",
      q: `${q}, Carmo, Rio de Janeiro, Brasil`,
      limit: "1",
      countrycodes: "br",
      viewbox: "-42.65,-21.90,-42.55,-21.97",
      bounded: "0",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit?.lat || !hit?.lon) return null;
    return {
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      label: hit.display_name?.split(",").slice(0, 3).join(",").trim() || q,
    };
  } catch {
    return null;
  }
}

async function fetchOsrmLine(points) {
  const valid = points.filter((p) => p && p.lat != null && p.lng != null);
  if (valid.length < 2) return null;
  try {
    const path = valid.map((p) => `${p.lng},${p.lat}`).join(";");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!coords?.length) return null;
    return coords.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  }
}

/** Mapa operacional do motorista: origem do passageiro, destino e posição do motorista. */
function DriverRideMap({ ride, driverPos, focusToken, height = 230 }) {
  const mapElRef = useRef(null);
  const mapObjRef = useRef(null);
  const layersRef = useRef({ markers: [], line: null });
  const lastFocusRef = useRef(null);

  useEffect(() => {
    if (!mapElRef.current || mapObjRef.current) return;
    const map = L.map(mapElRef.current, { zoomControl: false }).setView(
      [CARMO_CENTER.lat, CARMO_CENTER.lng],
      15
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapObjRef.current = map;
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    requestAnimationFrame(onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapObjRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapObjRef.current;
    if (!map || !ride) return;
    let cancelled = false;

    (async () => {
      layersRef.current.markers.forEach((m) => map.removeLayer(m));
      layersRef.current.markers = [];
      if (layersRef.current.line) {
        map.removeLayer(layersRef.current.line);
        layersRef.current.line = null;
      }

      const origin =
        ride.origin_lat != null && ride.origin_lng != null
          ? { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) }
          : null;
      const dest =
        ride.dest_lat != null && ride.dest_lng != null
          ? { lat: Number(ride.dest_lat), lng: Number(ride.dest_lng) }
          : null;
      const me =
        driverPos?.lat != null && driverPos?.lng != null
          ? { lat: Number(driverPos.lat), lng: Number(driverPos.lng) }
          : null;

      const bounds = [];
      if (origin) {
        const m = L.marker([origin.lat, origin.lng], {
          icon: pinIcon(C.vest, "Pax", 30),
          zIndexOffset: 1200,
        }).addTo(map);
        m.bindTooltip("Passageiro (embarque)", { direction: "top", offset: [0, -12] });
        layersRef.current.markers.push(m);
        bounds.push([origin.lat, origin.lng]);
      }
      if (dest && (!origin || dest.lat !== origin.lat || dest.lng !== origin.lng)) {
        const m = L.marker([dest.lat, dest.lng], {
          icon: pinIcon("#F3F4F6", "Dest", 28),
          zIndexOffset: 1100,
        }).addTo(map);
        m.bindTooltip(ride.dest_address || "Destino", { direction: "top", offset: [0, -12] });
        layersRef.current.markers.push(m);
        bounds.push([dest.lat, dest.lng]);
      }
      if (me) {
        const m = L.marker([me.lat, me.lng], {
          icon: youDotIcon(),
          zIndexOffset: 1300,
        }).addTo(map);
        m.bindTooltip("Você", { direction: "top", offset: [0, -8] });
        layersRef.current.markers.push(m);
        bounds.push([me.lat, me.lng]);
      }

      const routePts = [me, origin, dest].filter(Boolean);
      let latLngs = null;
      if (routePts.length >= 2) {
        latLngs = await fetchOsrmLine(routePts);
        if (!latLngs) latLngs = routePts.map((p) => [p.lat, p.lng]);
      }
      if (!cancelled && latLngs?.length) {
        layersRef.current.line = L.polyline(latLngs, {
          color: C.vest,
          weight: 4,
          opacity: 0.9,
          dashArray: latLngs.length <= 3 ? "6 8" : null,
        }).addTo(map);
      }

      if (cancelled) return;

      const shouldFocus = focusToken != null && focusToken !== lastFocusRef.current;
      if (shouldFocus) lastFocusRef.current = focusToken;

      if (shouldFocus && origin) {
        map.setView([origin.lat, origin.lng], 16, { animate: true });
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      }
      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
    };
  }, [ride, driverPos?.lat, driverPos?.lng, focusToken]);

  return (
    <div
      className="carmoto-map"
      style={{ position: "relative", height, borderRadius: 18, overflow: "hidden", background: C.asphalt }}
    >
      <div ref={mapElRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          background: "rgba(255,255,255,0.94)",
          padding: "4px 9px",
          borderRadius: 999,
        }}
      >
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.ink }}>
          {ride?.origin_address || "Embarque do passageiro"}
        </span>
      </div>
    </div>
  );
}

function useLeaflet() {
  return true;
}

function RealMap() {
  const leafletReady = useLeaflet();
  const mapElRef = useRef(null);
  const mapObjRef = useRef(null);
  const liveMarkersRef = useRef([]);
  const youPosRef = useRef(null);
  const [status, setStatus] = useState("locating");
  const [nearby, setNearby] = useState([]);

  useEffect(() => {
    if (!leafletReady || !mapElRef.current || mapObjRef.current) return;
    const map = L.map(mapElRef.current, { zoomControl: false }).setView([CARMO_CENTER.lat, CARMO_CENTER.lng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    mapObjRef.current = map;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          youPosRef.current = { lat: latitude, lng: longitude };
          setStatus("granted");
          const youIcon = L.divIcon({
            className: "",
            html: `<div style="width:16px;height:16px;border-radius:999px;background:#fff;border:3px solid #E11D2E;box-shadow:0 0 0 5px rgba(225,29,46,0.18)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          L.marker([latitude, longitude], { icon: youIcon }).addTo(map);
          map.setView([latitude, longitude], 15);
        },
        () => setStatus("denied"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setStatus("denied");
    }

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    requestAnimationFrame(onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      map.remove();
      mapObjRef.current = null;
    };
  }, [leafletReady]);

  useEffect(() => {
    if (!leafletReady) return;
    let cancelled = false;
    async function poll() {
      try {
        const pos = youPosRef.current || CARMO_CENTER;
        const res = await api.nearbyDrivers(pos.lat, pos.lng);
        if (!cancelled) setNearby(res.drivers || []);
      } catch {
        if (!cancelled) setNearby([]);
      }
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [leafletReady]);

  useEffect(() => {
    const map = mapObjRef.current;
    if (!map) return;
    liveMarkersRef.current.forEach((m) => map.removeLayer(m));
    liveMarkersRef.current = [];
    nearby.forEach((d) => {
      if (d.lat == null || d.lng == null) return;
      const label = d.colete || "?";
      const icon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:30px;height:30px;border-radius:999px;background:rgba(225,29,46,0.22);animation:pulseLive 1.6s ease-out infinite;"></div><div style="width:26px;height:26px;border-radius:8px;background:${C.vest};border:2px solid ${C.vestDeep};display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;font-weight:700;font-size:10px;color:#fff">#${label}</div></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      liveMarkersRef.current.push(L.marker([d.lat, d.lng], { icon, zIndexOffset: 1000 }).addTo(map));
    });
  }, [nearby]);

  const liveCount = nearby.length;

  return (
    <div
      className="carmoto-map"
      style={{ position: "relative", height: 210, borderRadius: 18, overflow: "hidden", background: C.asphalt }}
    >
      <div ref={mapElRef} style={{ width: "100%", height: "100%" }} />
      {!leafletReady && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft }}>Carregando mapa…</span>
        </div>
      )}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,255,255,0.94)",
          padding: "4px 9px",
          borderRadius: 999,
        }}
      >
        <span
          className="animate-pulse"
          style={{ width: 6, height: 6, borderRadius: 999, background: status === "granted" ? C.red : C.inkSoft }}
        />
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.ink }}>
          {status === "granted"
            ? "Sua localização em tempo real"
            : status === "denied"
            ? "Sem permissão de GPS — mostrando Carmo, RJ"
            : "Buscando seu GPS…"}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 10,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,255,255,0.94)",
          padding: "4px 9px",
          borderRadius: 999,
        }}
      >
        <span
          className={liveCount > 0 ? "animate-pulse" : ""}
          style={{ width: 6, height: 6, borderRadius: 999, background: liveCount > 0 ? C.red : C.inkSoft }}
        />
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: C.ink }}>
          {liveCount > 0
            ? `${liveCount} motorista${liveCount > 1 ? "s" : ""} online`
            : "Nenhum motorista real conectado"}
        </span>
      </div>
    </div>
  );
}

function Radar() {
  const dots = [
    { top: "20%", left: "68%", delay: "0s" },
    { top: "62%", left: "22%", delay: "0.6s" },
    { top: "72%", left: "70%", delay: "1.1s" },
  ];
  return (
    <div style={{ position: "relative", width: 220, height: 220, margin: "0 auto" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute animate-ping"
          style={{
            top: "50%",
            left: "50%",
            width: 60 + i * 50,
            height: 60 + i * 50,
            marginLeft: -(30 + i * 25),
            marginTop: -(30 + i * 25),
            borderRadius: "999px",
            border: `2px solid rgba(225,29,46,${0.45 - i * 0.12})`,
            animationDuration: "2.4s",
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
        }}
      >
        <ColeteBadge number="voce" size="sm" />
      </div>
      {dots.map((d, i) => (
        <div
          key={i}
          className="absolute animate-pulse"
          style={{ top: d.top, left: d.left, animationDelay: d.delay }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 8, background: C.vest, border: `2px solid ${C.vestDeep}` }} />
        </div>
      ))}
    </div>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-sm transition-colors"
      style={{
        background: active ? C.ink : "transparent",
        color: active ? C.paper : C.inkSoft,
        border: `1px solid ${active ? C.ink : C.line}`,
        fontFamily: FONT,
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 pb-1" style={{ color: C.ink }}>
      <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600 }}>9:41</span>
      <div className="flex items-center gap-1">
        <div style={{ width: 3, height: 6, background: C.ink, borderRadius: 1 }} />
        <div style={{ width: 3, height: 8, background: C.ink, borderRadius: 1 }} />
        <div style={{ width: 3, height: 10, background: C.ink, borderRadius: 1 }} />
        <div style={{ width: 16, height: 9, border: `1px solid ${C.ink}`, borderRadius: 2, marginLeft: 4 }} />
      </div>
    </div>
  );
}

function PassengerRegister({ profile, onSaved }) {
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone_display || profile?.phone || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const n = String(name || "").trim();
    if (n.length < 2) {
      setErr("Informe seu nome");
      return;
    }
    if (!isValidPhoneBr(phone)) {
      setErr("Telefone inválido — use DDD + número");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await api.registerPassenger({
        device_id: getDeviceId("passenger"),
        name: n,
        phone,
      });
      const saved = {
        id: res.passenger.id,
        name: res.passenger.name,
        phone: res.passenger.phone,
        phone_display: res.passenger.phone_display || formatPhoneBr(res.passenger.phone),
      };
      savePassengerProfile(saved);
      onSaved(saved);
    } catch (e) {
      setErr(e.message || "Falha ao salvar cadastro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pb-6 flex-1 flex flex-col overflow-y-auto" style={{ color: C.ink }}>
      <div className="pt-4 pb-2">
        <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22, marginBottom: 6 }}>
          Seu cadastro
        </p>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkSoft, lineHeight: 1.45 }}>
          Nome e telefone são obrigatórios para chamar um mototáxi. O motorista verá esses dados.
        </p>
      </div>
      <label className="mt-4 mb-1" style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.inkSoft }}>
        Nome
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Como prefere ser chamado"
        autoComplete="name"
        className="w-full px-4 py-3 rounded-2xl outline-none mb-3"
        style={{ background: C.paperSoft, border: `1px solid ${C.line}`, fontFamily: FONT, fontSize: 15 }}
      />
      <label className="mb-1" style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.inkSoft }}>
        Telefone (com DDD)
      </label>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="(22) 99999-0000"
        autoComplete="tel"
        inputMode="tel"
        className="w-full px-4 py-3 rounded-2xl outline-none mb-3"
        style={{ background: C.paperSoft, border: `1px solid ${C.line}`, fontFamily: FONT, fontSize: 15 }}
      />
      {err && <p style={{ fontFamily: FONT, fontSize: 12, color: C.red, marginBottom: 8 }}>{err}</p>}
      <button
        onClick={save}
        disabled={busy}
        className="w-full py-4 rounded-2xl mt-auto"
        style={{
          background: C.red,
          color: C.white,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 15,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Salvando…" : "Continuar"}
      </button>
    </div>
  );
}

function PassengerApp({ step, setStep, rating, setRating, cityOpen, setCityOpen }) {
  const [profile, setProfile] = useState(() => loadPassengerProfile());
  const [profileReady, setProfileReady] = useState(false);
  const [ride, setRide] = useState(null);
  const [rideDriver, setRideDriver] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedDest, setSelectedDest] = useState("Praça Getúlio Vargas");
  const [searchLeft, setSearchLeft] = useState(ACCEPT_WINDOW_SEC);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadPassengerProfile();
      if (local) {
        if (!cancelled) {
          setProfile(local);
          setProfileReady(true);
        }
        return;
      }
      try {
        const res = await api.getPassengerMe(getDeviceId("passenger"));
        if (cancelled) return;
        if (res.passenger) {
          const saved = {
            id: res.passenger.id,
            name: res.passenger.name,
            phone: res.passenger.phone,
            phone_display: res.passenger.phone_display || formatPhoneBr(res.passenger.phone),
          };
          savePassengerProfile(saved);
          setProfile(saved);
        }
        setProfileReady(true);
      } catch {
        if (!cancelled) setProfileReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "searching" || !ride?.id) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.getRide(ride.id);
        if (cancelled) return;
        setRide(res.ride);
        setRideDriver(res.driver || null);
        if (res.ride?.status === "accepted" || res.ride?.status === "in_progress") {
          setStep("trip");
        } else if (res.ride?.status === "cancelled") {
          setErrorMsg("Nenhum mototaxista aceitou a tempo. Tente de novo.");
          setStep("home");
          setRide(null);
          setRideDriver(null);
        }
      } catch {
        /* mantém buscando */
      }
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, ride?.id, setStep]);

  useEffect(() => {
    if (step !== "searching" || !ride?.id) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const left = Math.ceil(remainingAcceptMs(ride) / 1000);
      setSearchLeft(left);
      if (left <= 0) {
        cancelled = true;
        api.cancelRide(ride.id).catch(() => {});
        setErrorMsg("Nenhum mototaxista aceitou a tempo. Tente de novo.");
        setStep("home");
        setRide(null);
        setRideDriver(null);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, ride?.id, ride?.created_at, setStep]);

  useEffect(() => {
    if (step !== "trip" || !ride?.id) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.getRide(ride.id);
        if (cancelled) return;
        setRide(res.ride);
        setRideDriver(res.driver || null);
        if (res.ride?.status === "completed") setStep("rating");
        if (res.ride?.status === "cancelled") {
          setStep("home");
          setRide(null);
          setRideDriver(null);
        }
      } catch {
        /* ignore */
      }
    }
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, ride?.id, setStep]);

  async function requestRide() {
    const destText = String(selectedDest || "").trim();
    if (!destText) {
      setErrorMsg("Digite ou escolha um destino");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      const pos = await new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(CARMO_CENTER);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(CARMO_CENTER),
          { enableHighAccuracy: true, timeout: 6000 }
        );
      });
      const known = DEST_LANDMARKS[destText];
      let destLat;
      let destLng;
      let destAddress = destText;
      if (known) {
        destLat = known.lat;
        destLng = known.lng;
      } else {
        const geo = await geocodeDestination(destText);
        if (geo) {
          destLat = geo.lat;
          destLng = geo.lng;
          destAddress = geo.label || destText;
        } else {
          // MVP: guarda o texto e usa ponto aproximado perto do passageiro
          destLat = pos.lat + 0.008;
          destLng = pos.lng + 0.006;
        }
      }
      const geoLabel = await reverseGeocodeLabel(pos.lat, pos.lng);
      const originAddress = geoLabel || `Embarque · ${formatCoords(pos.lat, pos.lng)}`;
      if (!profile?.name || !profile?.phone) {
        setErrorMsg("Complete seu cadastro (nome e telefone) antes de chamar");
        return;
      }
      const res = await api.createRide({
        passenger_device_id: getDeviceId("passenger"),
        passenger_name: profile.name,
        passenger_phone: profile.phone,
        origin_lat: pos.lat,
        origin_lng: pos.lng,
        origin_address: originAddress,
        dest_lat: destLat,
        dest_lng: destLng,
        dest_address: destAddress,
        fare_estimate: 6,
      });
      setRide(res.ride);
      setRideDriver(null);
      setSearchLeft(ACCEPT_WINDOW_SEC);
      setStep("searching");
    } catch (e) {
      setErrorMsg(e.message || "Falha ao chamar mototáxi");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRide() {
    if (!ride?.id) {
      setStep("home");
      return;
    }
    try {
      await api.cancelRide(ride.id);
    } catch {
      /* ignore */
    }
    setRide(null);
    setRideDriver(null);
    setStep("home");
  }

  const dests = ["Rodoviária", "Hospital Municipal", "Praça Getúlio Vargas", "Mercado Central"];

  if (!profileReady) {
    return (
      <div className="flex-1 flex items-center justify-center px-5" style={{ color: C.inkSoft, fontFamily: FONT }}>
        Carregando…
      </div>
    );
  }

  if (!profile?.name || !profile?.phone) {
    return <PassengerRegister profile={profile} onSaved={(p) => setProfile(p)} />;
  }

  if (step === "home") {
    return (
      <div className="px-5 pb-6 flex-1 flex flex-col overflow-y-auto" style={{ color: C.ink }}>
        <div className="flex items-center justify-between pt-2 pb-3">
          <div>
            <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft, marginBottom: 2 }}>Boa tarde</p>
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20 }}>Pra onde vamos?</p>
            <p style={{ fontFamily: FONT, fontSize: 11, color: C.inkSoft, marginTop: 4 }}>
              {profile.name} · {profile.phone_display || formatPhoneBr(profile.phone)}
              {" · "}
              <button
                type="button"
                onClick={() => setProfile({ ...profile, phone: "" })}
                style={{
                  color: C.red,
                  fontWeight: 600,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: FONT,
                  fontSize: 11,
                }}
              >
                editar
              </button>
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setCityOpen(!cityOpen)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full"
              style={{ background: C.paperSoft }}
            >
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600 }}>Carmo, RJ</span>
              <ChevronDown size={14} />
            </button>
            {cityOpen && (
              <div
                className="absolute right-0 mt-2 z-10 rounded-xl overflow-hidden shadow-xl"
                style={{ background: "#fff", width: 190 }}
              >
                <div className="px-3 py-2 text-sm font-semibold" style={{ background: C.red, color: C.white }}>
                  Carmo, RJ ✓
                </div>
                {["Sumidouro", "Duas Barras", "Cordeiro"].map((c) => (
                  <div key={c} className="px-3 py-2 text-sm flex items-center justify-between" style={{ color: C.inkSoft }}>
                    {c} <span style={{ fontSize: 10 }}>em breve</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-2">
          <RealMap />
        </div>
        <p style={{ fontFamily: FONT, fontSize: 10.5, color: C.inkSoft, marginBottom: 14 }}>
          Mapa real (OpenStreetMap) · seu navegador vai pedir permissão de localização
        </p>

        <label
          className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4"
          style={{ background: C.paperSoft, cursor: "text" }}
        >
          <MapPin size={18} color={C.inkSoft} aria-hidden />
          <input
            type="text"
            value={selectedDest}
            onChange={(e) => setSelectedDest(e.target.value)}
            placeholder="Digite o destino…"
            autoComplete="street-address"
            enterKeyHint="search"
            inputMode="text"
            className="flex-1 min-w-0 bg-transparent outline-none border-0"
            style={{
              fontFamily: FONT,
              fontSize: 14,
              color: C.ink,
              WebkitAppearance: "none",
              appearance: "none",
            }}
            aria-label="Destino da corrida"
          />
        </label>

        <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
          DESTINOS FREQUENTES
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {dests.map((d) => (
            <Chip key={d} active={selectedDest === d} onClick={() => setSelectedDest(d)}>
              {d}
            </Chip>
          ))}
        </div>

        <div className="mt-auto">
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl mb-3" style={{ background: C.paperSoft }}>
            <span style={{ fontFamily: FONT, fontSize: 13 }}>Corrida estimada</span>
            <span style={{ fontFamily: FONT, fontWeight: 600 }}>R$ 6,00 · 4 min</span>
          </div>
          {errorMsg && (
            <p style={{ fontFamily: FONT, fontSize: 12, color: C.red, marginBottom: 8 }}>{errorMsg}</p>
          )}
          <button
            onClick={requestRide}
            disabled={busy}
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            style={{ background: C.red, opacity: busy ? 0.7 : 1 }}
          >
            <MotoMark size={20} color={C.white} />
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, color: C.white, fontSize: 15 }}>
              {busy ? "Chamando…" : "Chamar mototáxi"}
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (step === "searching") {
    return (
      <div className="px-5 pb-6 flex-1 flex flex-col items-center justify-center" style={{ color: C.ink }}>
        <Radar />
        <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, marginTop: 18 }}>
          Procurando um mototáxi por perto…
        </p>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkSoft, marginTop: 4 }}>
          Destino: {selectedDest} · aguardando motorista online
        </p>
        <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkSoft, marginTop: 10 }}>
          Expira em {Math.max(0, searchLeft)}s
        </p>
        <button
          onClick={cancelRide}
          className="mt-6 px-5 py-2.5 rounded-xl"
          style={{ border: `1.5px solid ${C.ink}`, fontFamily: FONT, fontWeight: 600, fontSize: 13 }}
        >
          Cancelar busca
        </button>
      </div>
    );
  }

  if (step === "trip") {
    return (
      <div className="px-5 pb-6 flex-1 flex flex-col" style={{ color: C.ink }}>
        <div className="pt-2 pb-3">
          <RouteMap mode="trip" />
        </div>
        <div className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${C.paperSoft}` }}>
          <ColeteBadge number={rideDriver?.colete || "—"} />
          <div className="flex-1">
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15 }}>
              {rideDriver?.name || "Mototaxista"}
            </p>
            <div className="flex items-center gap-2">
              <Stars value={5} size={12} />
              <span style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft }}>
                {rideDriver?.vehicle || "Moto"}
                {rideDriver?.plate ? ` · ${rideDriver.plate}` : ""}
              </span>
            </div>
          </div>
          <button className="p-2.5 rounded-full" style={{ background: C.ink }}>
            <Phone size={16} color={C.white} />
          </button>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1.5" style={{ color: C.inkSoft }}>
            <Clock size={14} />
            <span style={{ fontFamily: FONT, fontSize: 13 }}>chegando em 3 min</span>
          </div>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15 }}>R$ 6,00</span>
        </div>
        <div className="mt-auto flex gap-3">
          <button
            onClick={cancelRide}
            className="flex-1 py-3.5 rounded-2xl"
            style={{ border: `1.5px solid ${C.ink}`, fontFamily: FONT, fontWeight: 600, fontSize: 14 }}
          >
            Cancelar
          </button>
          <button
            onClick={() => setStep("rating")}
            className="flex-1 py-3.5 rounded-2xl"
            style={{ background: C.red, color: C.white, fontFamily: FONT, fontWeight: 600, fontSize: 14 }}
          >
            Avaliar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-6 flex-1 flex flex-col items-center justify-center text-center" style={{ color: C.ink }}>
      <div className="mb-4">
        <MotoMark size={44} color={C.serra} />
      </div>
      <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Chegou!</p>
      <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkSoft, marginBottom: 18 }}>
        Como foi a corrida com {rideDriver?.name || "o mototaxista"}?
      </p>
      <Stars value={rating} onChange={setRating} />
      <button
        onClick={() => {
          setStep("home");
          setRating(0);
          setRide(null);
          setRideDriver(null);
        }}
        className="w-full py-3.5 rounded-2xl mt-8"
        style={{ background: C.red, color: C.white, fontFamily: FONT, fontWeight: 600, fontSize: 14 }}
      >
        Confirmar avaliação
      </button>
    </div>
  );
}

function DriverApp({ online, setOnline, step, setStep }) {
  const [barPct, setBarPct] = useState(100);
  const [acceptLeft, setAcceptLeft] = useState(ACCEPT_WINDOW_SEC);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState(null);
  const [, tick] = useState(0);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);
  const [driver, setDriver] = useState(null);
  const [incomingRide, setIncomingRide] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [apiError, setApiError] = useState("");
  const [myPos, setMyPos] = useState(null);
  const [mapFocusToken, setMapFocusToken] = useState(0);
  const mapSectionRef = useRef(null);
  const [statsPeriod, setStatsPeriod] = useState("today");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  async function refreshStats(driverId, period = statsPeriod) {
    if (!driverId) return;
    setStatsLoading(true);
    try {
      const res = await api.driverStats(driverId, period);
      setStats(res.stats || null);
    } catch {
      /* ignore */
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.registerDriver({
          device_id: getDeviceId("driver"),
          name: "Zé Roberto",
          colete: "032",
          plate: "ABC-1G34",
          vehicle: "Honda 160",
        });
        if (!cancelled) {
          setDriver(res.driver);
          refreshStats(res.driver.id, "today");
        }
      } catch (e) {
        if (!cancelled) setApiError(e.message || "Falha ao registrar motorista");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!driver?.id) return;
    refreshStats(driver.id, statsPeriod);
    const id = setInterval(() => refreshStats(driver.id, statsPeriod), 20000);
    return () => clearInterval(id);
  }, [driver?.id, statsPeriod, online, step]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  useEffect(() => {
    if (!online || step !== "idle" || !driver?.id) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.pendingRides();
        if (cancelled) return;
        const first = (res.rides || [])[0];
        if (first) {
          setIncomingRide(first);
          setMapFocusToken((n) => n + 1);
          setStep("incoming");
        }
      } catch {
        /* ignore */
      }
    }
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [online, step, driver?.id, setStep]);

  useEffect(() => {
    if (step !== "incoming" || !incomingRide?.id) return;
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const ms = remainingAcceptMs(incomingRide);
      const left = Math.ceil(ms / 1000);
      setAcceptLeft(left);
      setBarPct(Math.max(0, (ms / ACCEPT_WINDOW_MS) * 100));
      if (ms <= 0) {
        cancelled = true;
        setIncomingRide(null);
        setStep("idle");
        setApiError("Chamado expirou — ninguém aceitou a tempo");
      }
    };
    sync();
    const id = setInterval(sync, 200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [step, incomingRide?.id, incomingRide?.created_at, setStep]);

  // atualiza o "há Xs" do último envio enquanto estiver compartilhando
  useEffect(() => {
    if (!sharing) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sharing]);

  // limpa o watchPosition se o componente sair de tela
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function startSharing(force = false) {
    if (!navigator.geolocation || !driver?.id) return;
    if (sharing && !force) return;
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyPos({ lat: latitude, lng: longitude });
        const now = Date.now();
        if (now - lastSentRef.current < 4000) return;
        lastSentRef.current = now;
        api.updateDriverLocation(driver.id, latitude, longitude).catch(() => {});
        setLastSent(now);
      },
      () => setSharing(false),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    watchIdRef.current = id;
    setSharing(true);
  }

  async function toggleOnline() {
    if (!driver?.id) return;
    const next = !online;
    setApiError("");
    try {
      let lat = myPos?.lat ?? CARMO_CENTER.lat;
      let lng = myPos?.lng ?? CARMO_CENTER.lng;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
            })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          setMyPos({ lat, lng });
        } catch {
          /* usa última posição / Carmo */
        }
      }
      const res = await api.setDriverStatus(driver.id, { online: next, lat, lng });
      setDriver(res.driver);
      setOnline(next);
      setStep("idle");
      setIncomingRide(null);
      setActiveRide(null);
      if (next) {
        startSharing(true);
      } else {
        if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setSharing(false);
      }
      refreshStats(driver.id, statsPeriod);
    } catch (e) {
      setApiError(e.message || "Falha ao atualizar status");
    }
  }

  function toggleSharing() {
    if (sharing) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharing(false);
      return;
    }
    startSharing(true);
  }

  async function acceptIncoming() {
    if (!incomingRide?.id || !driver?.id) return;
    try {
      const res = await api.acceptRide(incomingRide.id, driver.id);
      setActiveRide(res.ride);
      setIncomingRide(null);
      setMapFocusToken((n) => n + 1);
      startSharing();
      setStep("trip");
    } catch (e) {
      setApiError(e.message || "Não foi possível aceitar");
      setIncomingRide(null);
      setStep("idle");
    }
  }

  async function refuseIncoming() {
    setIncomingRide(null);
    setStep("idle");
  }

  async function finishRide() {
    if (activeRide?.id) {
      try {
        await api.completeRide(activeRide.id);
      } catch {
        /* ignore */
      }
    }
    setActiveRide(null);
    setStep("idle");
    if (driver?.id) refreshStats(driver.id, statsPeriod);
  }

  function formatHours(h) {
    const n = Number(h) || 0;
    if (n < 0.05) return "0h";
    if (n < 1) return `${Math.round(n * 60)}min`;
    return `${n.toFixed(1).replace(".", ",")}h`;
  }

  function focusPassengerOnMap() {
    setMapFocusToken((n) => n + 1);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const mapRide = step === "trip" ? activeRide : incomingRide;
  const pickupLabel =
    mapRide?.origin_address ||
    (mapRide ? `Embarque · ${formatCoords(mapRide.origin_lat, mapRide.origin_lng)}` : "");
  const pickupCoords =
    mapRide?.origin_lat != null ? formatCoords(mapRide.origin_lat, mapRide.origin_lng) : "";
  const distKm =
    myPos && mapRide?.origin_lat != null
      ? haversineKmClient(myPos.lat, myPos.lng, Number(mapRide.origin_lat), Number(mapRide.origin_lng))
      : null;

  return (
    <div className="px-5 pb-6 flex-1 flex flex-col overflow-y-auto" style={{ color: C.ink }}>
      <div className="flex items-center justify-between pt-2 pb-5">
        <div className="flex items-center gap-3">
          <ColeteBadge number="032" size="lg" />
          <div>
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16 }}>Zé Roberto</p>
            <div className="flex items-center gap-1">
              <Stars value={5} size={12} />
            </div>
          </div>
        </div>
        <button
          onClick={toggleOnline}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-colors"
          style={{ background: online ? C.ink : C.panel, border: `1px solid ${C.line}` }}
        >
          <Power size={16} color={online ? C.white : C.inkSoft} />
          <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: online ? C.white : C.inkSoft }}>
            {online ? "ONLINE" : "OFFLINE"}
          </span>
        </button>
      </div>

      {apiError && (
        <p style={{ fontFamily: FONT, fontSize: 11, color: C.red, marginBottom: 10 }}>{apiError}</p>
      )}

      <div
        className="flex items-center justify-between rounded-2xl p-3.5 mb-5"
        style={{ background: C.panel, border: `1px solid ${C.line}` }}
      >
        <div>
          <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600 }}>GPS real</p>
          <p style={{ fontFamily: FONT, fontSize: 11, color: C.inkSoft }}>
            {sharing
              ? lastSent
                ? `Compartilhando · atualizado há ${Math.max(0, Math.floor((Date.now() - lastSent) / 1000))}s`
                : "Buscando sinal de GPS…"
              : "Parado — o passageiro não te vê no mapa"}
          </p>
        </div>
        <button
          onClick={toggleSharing}
          className="px-3.5 py-2 rounded-full transition-colors"
          style={{ background: sharing ? C.red : C.panel, border: `1px solid ${C.line}` }}
        >
          <span
            style={{
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 700,
              color: sharing ? C.white : C.ink,
            }}
          >
            {sharing ? "Ativo" : "Ativar"}
          </span>
        </button>
      </div>

      {!(step === "incoming" || step === "trip") && (
        <div className="mb-5">
          <div className="flex gap-2 mb-3">
            {[
              { id: "today", label: "Hoje" },
              { id: "7d", label: "7 dias" },
              { id: "30d", label: "30 dias" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatsPeriod(t.id)}
                className="px-3 py-1.5 rounded-full"
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  background: statsPeriod === t.id ? C.red : C.panel,
                  color: statsPeriod === t.id ? C.white : C.inkSoft,
                  border: `1px solid ${statsPeriod === t.id ? C.red : C.line}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-2xl p-3.5" style={{ background: C.panel }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: C.inkSoft }}>
                <Wallet size={13} />
                <span style={{ fontFamily: FONT, fontSize: 11 }}>Ganhos</span>
              </div>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 18 }}>
                R$ {(stats?.revenue ?? 0).toFixed(2)}
              </p>
              <p style={{ fontFamily: FONT, fontSize: 10, color: C.inkSoft, marginTop: 2 }}>
                {statsLoading ? "Atualizando…" : stats?.period || "período"}
              </p>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: C.panel }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: C.inkSoft }}>
                <MotoMark size={13} color={C.inkSoft} />
                <span style={{ fontFamily: FONT, fontSize: 11 }}>Corridas</span>
              </div>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 18 }}>{stats?.completed ?? 0}</p>
              <p style={{ fontFamily: FONT, fontSize: 10, color: C.inkSoft, marginTop: 2 }}>
                ticket R$ {(stats?.ticket_avg ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: C.panel }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: C.inkSoft }}>
                <Clock size={13} />
                <span style={{ fontFamily: FONT, fontSize: 11 }}>Online</span>
              </div>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 18 }}>
                {formatHours(stats?.hours_online)}
              </p>
              <p style={{ fontFamily: FONT, fontSize: 10, color: C.inkSoft, marginTop: 2 }}>
                tempo logado
              </p>
            </div>
            <div className="rounded-2xl p-3.5" style={{ background: C.panel }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: C.inkSoft }}>
                <Wallet size={13} />
                <span style={{ fontFamily: FONT, fontSize: 11 }}>R$/hora</span>
              </div>
              <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 18 }}>
                {stats?.earnings_per_hour != null
                  ? `R$ ${Number(stats.earnings_per_hour).toFixed(2)}`
                  : "—"}
              </p>
              <p style={{ fontFamily: FONT, fontSize: 10, color: C.inkSoft, marginTop: 2 }}>
                média por hora online
              </p>
            </div>
          </div>
          {(stats?.recent_rides || []).length > 0 && (
            <div
              className="rounded-2xl p-3.5"
              style={{ background: C.white, border: `1px solid ${C.line}` }}
            >
              <p
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 8,
                  color: C.inkSoft,
                }}
              >
                Últimas corridas
              </p>
              <div className="flex flex-col gap-2">
                {stats.recent_rides.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <p
                      style={{
                        fontFamily: FONT,
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {r.dest_address || r.origin_address || "Corrida"}
                    </p>
                    <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
                      R$ {Number(r.fare || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!online && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p style={{ fontFamily: FONT, fontSize: 13, color: C.inkSoft }}>
            Fique online pra começar a receber chamados
          </p>
        </div>
      )}

      {online && step === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="mb-4 animate-pulse">
            <Bell size={30} color={C.vest} />
          </div>
          <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15 }}>Aguardando chamados…</p>
          <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
            Quando chegar um chamado, o mapa mostra de onde o passageiro está
          </p>
        </div>
      )}

      {step === "incoming" && mapRide && (
        <div className="flex-1 flex flex-col">
          <div ref={mapSectionRef} className="mb-3">
            <DriverRideMap ride={mapRide} driverPos={myPos} focusToken={mapFocusToken} height={240} />
          </div>
          <div className="rounded-2xl p-4 mt-auto" style={{ background: C.white, color: C.ink, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft }}>Novo chamado</p>
              <p
                style={{
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 14,
                  color: acceptLeft <= 5 ? C.red : C.ink,
                }}
              >
                {Math.max(0, acceptLeft)}s
              </p>
            </div>
            <div className="h-1 rounded-full mb-3" style={{ background: C.paperSoft }}>
              <div
                className="h-1 rounded-full"
                style={{
                  background: C.red,
                  width: `${barPct}%`,
                  transition: "width 0.2s linear",
                }}
              />
            </div>
            <div className="flex items-start gap-2 mb-1">
              <MapPin size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>{pickupLabel}</p>
                <p style={{ fontFamily: FONT, fontSize: 11, color: C.inkSoft }}>{pickupCoords}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Navigation size={14} />
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
                {mapRide.dest_address || "Destino"} · Carmo
              </span>
            </div>
            {distKm != null && (
              <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>
                ≈ {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} até o passageiro
              </p>
            )}
            {(mapRide.passenger_name || mapRide.passenger_phone) && (
              <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>
                {mapRide.passenger_name || "Passageiro"}
                {mapRide.passenger_phone ? ` · ${formatPhoneBr(mapRide.passenger_phone)}` : ""}
              </p>
            )}
            <NavExternalButtons
              lat={mapRide.origin_lat}
              lng={mapRide.origin_lng}
              label="Até o passageiro"
            />
            <button
              type="button"
              onClick={focusPassengerOnMap}
              className="w-full py-2.5 rounded-xl mb-3 flex items-center justify-center gap-1.5"
              style={{ background: C.paperSoft, fontFamily: FONT, fontWeight: 600, fontSize: 12.5 }}
            >
              <MapPin size={14} />
              Ver no mapa
            </button>
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft }}>Você recebe</span>
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16 }}>
                R$ {Number(mapRide.fare_estimate ?? 5.4).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={refuseIncoming}
                className="flex-1 py-3 rounded-xl flex items-center justify-center gap-1.5"
                style={{ border: `1.5px solid ${C.ink}` }}
              >
                <X size={15} />
                <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13 }}>Recusar</span>
              </button>
              <button
                onClick={acceptIncoming}
                className="flex-1 py-3 rounded-xl flex items-center justify-center gap-1.5"
                style={{ background: C.red, color: C.white }}
              >
                <Check size={15} />
                <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13 }}>Aceitar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "trip" && activeRide && (
        <div className="flex-1 flex flex-col">
          <div ref={mapSectionRef} className="mb-3">
            <DriverRideMap ride={activeRide} driverPos={myPos} focusToken={mapFocusToken} height={250} />
          </div>
          <div className="rounded-2xl p-3.5 mb-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="flex items-start gap-2 mb-2">
              <MapPin size={14} color={C.vest} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft }}>Embarque</p>
                <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>{pickupLabel}</p>
                <p style={{ fontFamily: FONT, fontSize: 11, color: C.inkSoft }}>{pickupCoords}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Navigation size={14} color={C.vest} />
              <span style={{ fontFamily: FONT, fontSize: 13 }}>
                Destino: {activeRide.dest_address || "destino"}
              </span>
            </div>
            {distKm != null && (
              <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft, marginTop: 8 }}>
                ≈ {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} até o passageiro
              </p>
            )}
          </div>
          {(activeRide.passenger_name || activeRide.passenger_phone) && (
            <p style={{ fontFamily: FONT, fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>
              {activeRide.passenger_name || "Passageiro"}
              {activeRide.passenger_phone ? ` · ${formatPhoneBr(activeRide.passenger_phone)}` : ""}
            </p>
          )}
          <NavExternalButtons
            lat={activeRide.origin_lat}
            lng={activeRide.origin_lng}
            label="Até o passageiro"
          />
          <NavExternalButtons
            lat={activeRide.dest_lat}
            lng={activeRide.dest_lng}
            label="Até o destino"
          />
          <button
            type="button"
            onClick={focusPassengerOnMap}
            className="w-full py-2.5 rounded-xl mb-3 flex items-center justify-center gap-1.5"
            style={{ background: C.panel, border: `1px solid ${C.line}`, fontFamily: FONT, fontWeight: 600, fontSize: 12.5 }}
          >
            <MapPin size={14} color={C.vest} />
            Centralizar no passageiro
          </button>
          <button
            onClick={finishRide}
            className="w-full py-3.5 rounded-2xl mt-auto"
            style={{ background: C.red, color: C.white, fontFamily: FONT, fontWeight: 700, fontSize: 14 }}
          >
            Concluir corrida
          </button>
        </div>
      )}
    </div>
  );
}

function normalizePath(pathname) {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  if (clean === "/passageiro" || clean === "/motorista" || clean === "/admin") return clean;
  // Sem hub: qualquer outra rota (incl. `/`) vira app passageiro
  return "/passageiro";
}

function useAppPath() {
  const [path, setPath] = useState(() => {
    const next = normalizePath(window.location.pathname);
    const current = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
    if (next !== current) window.history.replaceState({}, "", next);
    return next;
  });

  useEffect(() => {
    const onPop = () => {
      const next = normalizePath(window.location.pathname);
      const current = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
      if (next !== current) window.history.replaceState({}, "", next);
      setPath(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (to) => {
    const next = normalizePath(to);
    if (next === path) return;
    window.history.pushState({}, "", next);
    setPath(next);
  };

  return { path, navigate };
}

function useIsWide(minWidth = 720) {
  const [wide, setWide] = useState(() => window.matchMedia(`(min-width: ${minWidth}px)`).matches);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [minWidth]);

  return wide;
}

function useRoleManifest(path) {
  useEffect(() => {
    const href =
      path === "/passageiro"
        ? "/manifest-passageiro.webmanifest"
        : path === "/motorista"
        ? "/manifest-motorista.webmanifest"
        : "/manifest.webmanifest";

    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.setAttribute("href", href);

    const title =
      path === "/passageiro"
        ? "MotoJá Passageiro"
        : path === "/motorista"
        ? "MotoJá Motorista"
        : path === "/admin"
        ? "MotoJá Admin"
        : "MotoJá — Carmo, RJ";
    document.title = title;

    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", "#E11D2E");

    const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (apple) {
      apple.setAttribute(
        "content",
        path === "/passageiro" ? "MotoJá Pax" : path === "/motorista" ? "MotoJá Moto" : "MotoJá"
      );
    }
  }, [path]);
}

function InstallHint({ appName }) {
  const [promptEvent, setPromptEvent] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  return (
    <div
      className="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl w-full"
      style={{ background: C.white, border: `1px solid ${C.line}`, maxWidth: 520 }}
    >
      <div className="flex-1">
        <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 13, color: C.ink }}>
          Instalar {appName}
        </p>
        <p style={{ fontFamily: FONT, fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
          {promptEvent
            ? "Abre como app, sem a barra do navegador"
            : "No Android/Brave: menu ⋮ → Instalar app / Adicionar à tela inicial (precisa HTTPS com PWA publicada)"}
        </p>
      </div>
      {promptEvent && (
        <button
          onClick={async () => {
            promptEvent.prompt();
            await promptEvent.userChoice;
            setPromptEvent(null);
          }}
          className="px-3 py-2 rounded-xl shrink-0"
          style={{ background: C.red, color: C.white, fontFamily: FONT, fontWeight: 700, fontSize: 12 }}
        >
          Instalar
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Fechar"
        className="p-1 shrink-0"
        style={{ color: C.inkSoft }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function BrandMark({ size = 22 }) {
  return (
    <div className="flex items-center gap-2">
      <MotoMark size={size} />
      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size >= 22 ? 20 : 17, color: C.ink }}>
        <span style={{ color: C.ink }}>Moto</span>
        <span style={{ color: C.red }}>Já</span>
      </span>
    </div>
  );
}

function AppShell({ role, wide, children }) {
  const isPassenger = role === "passenger";

  if (wide) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 pb-8 pt-4 flex flex-col items-center">
        <div className="w-full flex items-center justify-between mb-4 gap-3">
          <BrandMark size={20} />
          <span
            className="px-3 py-1 rounded-full"
            style={{
              background: isPassenger ? C.red : C.ink,
              color: C.white,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {isPassenger ? "Passageiro" : "Mototaxista"}
          </span>
        </div>
        <div
          className="w-full overflow-hidden flex flex-col"
          style={{
            minHeight: "min(820px, calc(100vh - 120px))",
            borderRadius: 28,
            background: C.white,
            border: `1px solid ${C.line}`,
            boxShadow: "0 8px 28px rgba(17,17,17,0.06)",
          }}
        >
          {children}
        </div>
        <InstallHint appName={isPassenger ? "MotoJá Passageiro" : "MotoJá Motorista"} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center px-4 py-8">
      <BrandMark />
      <p style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkSoft, marginTop: 8, marginBottom: 20, textAlign: "center" }}>
        {isPassenger ? "App do passageiro" : "App do mototaxista"}
      </p>

      <div
        className="w-full"
        style={{
          maxWidth: 390,
          borderRadius: 40,
          background: C.white,
          padding: 8,
          border: `1px solid ${C.line}`,
          boxShadow: "0 12px 32px rgba(17,17,17,0.08)",
        }}
      >
        <div
          style={{
            width: "100%",
            minHeight: 640,
            height: "min(680px, calc(100vh - 180px))",
            borderRadius: 30,
            overflow: "hidden",
            background: C.white,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <StatusBar />
          {children}
        </div>
      </div>

      <InstallHint appName={isPassenger ? "MotoJá Passageiro" : "MotoJá Motorista"} />
      <p style={{ fontFamily: FONT, fontSize: 11, color: C.inkSoft, marginTop: 14 }}>
        MotoJá — toque nos botões pra navegar pelo fluxo
      </p>
    </div>
  );
}

export default function CarmotoPrototype() {
  const { path, navigate } = useAppPath();
  const wide = useIsWide(720);
  useRoleManifest(path);

  const [pStep, setPStep] = useState("home");
  const [rating, setRating] = useState(0);
  const [cityOpen, setCityOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [dStep, setDStep] = useState("idle");

  const role = path === "/motorista" ? "driver" : path === "/passageiro" ? "passenger" : null;

  return (
    <div className="min-h-screen w-full" style={{ background: C.asphalt, fontFamily: FONT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Space+Grotesk:wght@500;700&display=swap');
        @keyframes motoDrift {
          0% { transform: translate(0,0); }
          50% { transform: translate(5px,-4px); }
          100% { transform: translate(0,0); }
        }
        .moto-drift {
          animation-name: motoDrift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes pulseLive {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @media (min-width: 720px) {
          .carmoto-map { height: 320px !important; }
        }
      `}</style>

      {path === "/admin" && <AdminApp />}

      {role === "passenger" && (
        <AppShell role="passenger" wide={wide}>
          <PassengerApp
            step={pStep}
            setStep={setPStep}
            rating={rating}
            setRating={setRating}
            cityOpen={cityOpen}
            setCityOpen={setCityOpen}
          />
        </AppShell>
      )}

      {role === "driver" && (
        <AppShell role="driver" wide={wide}>
          <DriverApp
            online={online}
            setOnline={setOnline}
            step={dStep}
            setStep={setDStep}
          />
        </AppShell>
      )}
    </div>
  );
}
