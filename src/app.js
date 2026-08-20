// mototaxi — frontend com mapa (Leaflet) e geolocation
(() => {
  const STORAGE_KEY = "mototaxi_rides_v1";

  // UI
  const tabPassenger = document.getElementById("tabPassenger");
  const tabDriver = document.getElementById("tabDriver");
  const passengerView = document.getElementById("passengerView");
  const driverView = document.getElementById("driverView");

  const rideForm = document.getElementById("rideForm");
  const passengerRides = document.getElementById("passengerRides");
  const pendingRides = document.getElementById("pendingRides");
  const driverRides = document.getElementById("driverRides");

  const originInput = document.getElementById("origin");
  const destinationInput = document.getElementById("destination");
  const useMyLocationBtn = document.getElementById("useMyLocation");
  const findDestinationBtn = document.getElementById("findDestination");

  const template = document.getElementById("rideTemplate");

  // Maps
  let map, driverMap;
  let originMarker = null;
  let destinationMarker = null;
  const pendingMarkers = new Map(); // rideId -> marker

  // ---------- Storage helpers ----------
  function loadRides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  }
  function saveRides(rides) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rides));
    window.dispatchEvent(new Event("storage"));
  }
  function genId() { return `${Date.now()}-${Math.floor(Math.random()*1000)}`; }

  // ---------- Map init ----------
  function initMaps() {
    // Passenger map
    if (!map) {
      map = L.map("map", { preferCanvas: true }).setView([-22.9, -43.2], 13); // default view
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      // Click handlers: Shift+Click set origin, Alt+Click set destination
      map.on("click", (e) => {
        const evt = e.originalEvent;
        if (evt.shiftKey) {
          setOriginFromCoords(e.latlng.lat, e.latlng.lng, false);
        } else if (evt.altKey) {
          setDestinationFromCoords(e.latlng.lat, e.latlng.lng, false);
        }
      });
    }

    // Driver map
    if (!driverMap) {
      driverMap = L.map("driverMap", { preferCanvas: true }).setView([-22.9, -43.2], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; OpenStreetMap'
      }).addTo(driverMap);
    }
  }

  // ---------- Markers ----------
  function setOriginMarker(lat, lng) {
    if (originMarker) originMarker.setLatLng([lat, lng]);
    else originMarker = L.marker([lat,lng], {title:"Origem"}).addTo(map);
    map.setView([lat,lng], 14);
  }
  function setDestinationMarker(lat, lng) {
    if (destinationMarker) destinationMarker.setLatLng([lat, lng]);
    else destinationMarker = L.marker([lat,lng], {title:"Destino", icon: L.icon({iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconSize:[25,41]})}).addTo(map);
    map.fitBounds(L.latLngBounds([ [lat,lng], originMarker ? originMarker.getLatLng() : [lat,lng] ]));
  }

  // ---------- Geolocation ----------
  function useMyLocation() {
    if (!navigator.geolocation) return alert("Geolocalização não suportada neste navegador.");
    useMyLocationBtn.disabled = true;
    useMyLocationBtn.textContent = "Obtendo localização...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        originInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setOriginFromCoords(lat, lng, true);
      },
      (err) => alert("Falha ao obter localização: " + err.message),
      { timeout: 15000, maximumAge: 60_000 }
    ).finally(() => {
      useMyLocationBtn.disabled = false;
      useMyLocationBtn.textContent = "Usar minha localização";
    });
  }

  function setOriginFromCoords(lat, lng, setText) {
    setOriginMarker(lat, lng);
    if (setText) originInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
  function setDestinationFromCoords(lat, lng, setText) {
    setDestinationMarker(lat, lng);
    if (setText) destinationInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  // ---------- Geocoding (Nominatim) ----------
  async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const resp = await fetch(url, { headers: { "User-Agent": "mototaxi-demo" } });
    if (!resp.ok) throw new Error("Geocoding falhou");
    const results = await resp.json();
    if (!results || !results.length) return null;
    return { lat: Number(results[0].lat), lon: Number(results[0].lon), display: results[0].display_name };
  }

  // ---------- Render UI ----------
  function createRideCard(ride, options = {}) {
    const node = template.content.cloneNode(true);
    node.querySelector(".ride-passenger").textContent = ride.passengerName;
    node.querySelector(".ride-phone").textContent = ride.passengerPhone;
    node.querySelector(".ride-origin").textContent = ride.originText || ride.origin || "—";
    node.querySelector(".ride-destination").textContent = ride.destinationText || ride.destination || "—";
    node.querySelector(".ride-status").textContent = `Status: ${ride.status}`;
    const actions = node.querySelector(".actions");
    actions.innerHTML = "";

    if (options.showAccept) {
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "Aceitar";
      btn.addEventListener("click", () => acceptRide(ride.id));
      actions.appendChild(btn);
    }

    if (options.showComplete) {
      const btn = document.createElement("button");
      btn.className = "btn success";
      btn.textContent = "Concluir";
      btn.addEventListener("click", () => completeRide(ride.id));
      actions.appendChild(btn);
    }

    if (options.showCancel) {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Cancelar";
      btn.addEventListener("click", () => cancelRide(ride.id));
      actions.appendChild(btn);
    }

    return node;
  }

  function renderPassengerRides() {
    const rides = loadRides();
    passengerRides.innerHTML = "";
    const name = document.getElementById("passengerName").value.trim();
    const mine = rides.filter((r) => (name ? r.passengerName === name : true)).reverse();
    if (!mine.length) {
      passengerRides.textContent = "Nenhuma corrida encontrada.";
      return;
    }
    for (const ride of mine) {
      const card = createRideCard(ride, { showCancel: ride.status === "requested" });
      passengerRides.appendChild(card);
    }
  }

  function clearDriverMarkers() {
    for (const m of pendingMarkers.values()) driverMap.removeLayer(m);
    pendingMarkers.clear();
  }

  function renderDriverPanels() {
    const rides = loadRides();
    pendingRides.innerHTML = "";
    driverRides.innerHTML = "";

    // Pending list + markers
    const pending = rides.filter((r) => r.status === "requested");
    clearDriverMarkers();
    if (!pending.length) pendingRides.textContent = "Nenhum pedido pendente.";
    else {
      for (const ride of pending) {
        const card = createRideCard(ride, { showAccept: true });
        pendingRides.appendChild(card);

        // add marker on driverMap if coords available
        if (ride.originCoords) {
          const m = L.marker([ride.originCoords.lat, ride.originCoords.lng]).addTo(driverMap)
            .bindPopup(`<strong>${ride.passengerName}</strong><br>${ride.originText || ride.origin}`);
          pendingMarkers.set(ride.id, m);
        }
      }
    }

    // Accepted
    const accepted = rides.filter((r) => r.status === "accepted");
    if (!accepted.length) driverRides.textContent = "Nenhuma corrida aceita.";
    else {
      for (const ride of accepted) {
        const card = createRideCard(ride, { showComplete: true });
        driverRides.appendChild(card);
      }
    }
  }

  // ---------- Actions ----------
  function addRide({ name, phone, originText, destinationText, originCoords, destinationCoords }) {
    const rides = loadRides();
    const ride = {
      id: genId(),
      passengerName: name,
      passengerPhone: phone,
      originText: originText || "",
      destinationText: destinationText || "",
      origin: originCoords ? `${originCoords.lat},${originCoords.lng}` : originText,
      destination: destinationCoords ? `${destinationCoords.lat},${destinationCoords.lng}` : destinationText,
      originCoords: originCoords ? { lat: originCoords.lat, lng: originCoords.lng } : null,
      destinationCoords: destinationCoords ? { lat: destinationCoords.lat, lng: destinationCoords.lng } : null,
      status: "requested",
      createdAt: new Date().toISOString(),
      driverName: null
    };
    rides.push(ride);
    saveRides(rides);
    renderPassengerRides();
    renderDriverPanels();
  }

  function acceptRide(id) {
    const rides = loadRides();
    const ride = rides.find((r) => r.id === id);
    if (!ride) return alert("Corrida não encontrada.");
    const driver = prompt("Seu nome (piloto):", "Piloto");
    if (!driver) return;
    ride.status = "accepted";
    ride.driverName = driver;
    saveRides(rides);
    renderPassengerRides();
    renderDriverPanels();
  }

  function completeRide(id) {
    const rides = loadRides();
    const ride = rides.find((r) => r.id === id);
    if (!ride) return alert("Corrida não encontrada.");
    ride.status = "completed";
    saveRides(rides);
    renderPassengerRides();
    renderDriverPanels();
  }

  function cancelRide(id) {
    const rides = loadRides();
    const idx = rides.findIndex((r) => r.id === id);
    if (idx === -1) return;
    if (!confirm("Cancelar esta corrida?")) return;
    rides.splice(idx, 1);
    saveRides(rides);
    renderPassengerRides();
    renderDriverPanels();
  }

  // ---------- UI events ----------
  tabPassenger.addEventListener("click", () => {
    tabPassenger.classList.add("active");
    tabDriver.classList.remove("active");
    passengerView.classList.remove("hidden");
    driverView.classList.add("hidden");
  });
  tabDriver.addEventListener("click", () => {
    tabDriver.classList.add("active");
    tabPassenger.classList.remove("active");
    driverView.classList.remove("hidden");
    passengerView.classList.add("hidden");
    // center driver map to show markers
    setTimeout(() => { driverMap.invalidateSize(); }, 200);
  });

  rideForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = document.getElementById("passengerName").value.trim();
    const phone = document.getElementById("passengerPhone").value.trim();
    const originText = originInput.value.trim();
    const destinationText = destinationInput.value.trim();
    if (!name || !phone || !originText || !destinationText) return alert("Preencha todos os campos.");

    // try parse coords from inputs in format "lat, lng"
    let originCoords = null, destinationCoords = null;
    const coordRegex = /^\s*([-+]?\d+(\.\d+)?)[ ,]+([-+]?\d+(\.\d+)?)\s*$/;
    const oMatch = originText.match(coordRegex);
    if (oMatch) originCoords = { lat: Number(oMatch[1]), lng: Number(oMatch[3]) };
    const dMatch = destinationText.match(coordRegex);
    if (dMatch) destinationCoords = { lat: Number(dMatch[1]), lng: Number(dMatch[3]) };

    // if no coords, don't block creation; optionally we could geocode
    addRide({ name, phone, originText, destinationText, originCoords, destinationCoords });

    // clear destination/origin text
    originInput.value = "";
    destinationInput.value = "";
  });

  useMyLocationBtn.addEventListener("click", useMyLocation);

  findDestinationBtn.addEventListener("click", async () => {
    const q = destinationInput.value.trim();
    if (!q) return alert("Digite um endereço ou clique no mapa para selecionar destino.");
    findDestinationBtn.disabled = true;
    findDestinationBtn.textContent = "Buscando...";
    try {
      const r = await geocode(q);
      if (!r) return alert("Endereço não encontrado.");
      setDestinationFromCoords(r.lat, r.lon, true);
    } catch (err) {
      alert("Erro ao geocodar: " + err.message);
    } finally {
      findDestinationBtn.disabled = false;
      findDestinationBtn.textContent = "Encontrar";
    }
  });

  // react to storage changes (other tabs)
  window.addEventListener("storage", () => {
    renderPassengerRides();
    renderDriverPanels();
  });

  // ---------- Init ----------
  function init() {
    initMaps();
    renderPassengerRides();
    renderDriverPanels();
  }

  init();
})();
