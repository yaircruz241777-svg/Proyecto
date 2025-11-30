// --- ESTADO GLOBAL ---
let map, marker, userMarker;
let userCoords = { lat: 19.4326, lng: -99.1332 }; // Default: CDMX
let isUserLocated = false;
let captchaSolution = 0;

document.addEventListener('DOMContentLoaded', () => {
    initCaptcha();
    updateVisitCounter(); // CONTADOR DE VISITAS
    
    document.getElementById('login-form').addEventListener('submit', handleLogin);
});

// --- LÓGICA DE CONTADOR (LocalStorage) ---
function updateVisitCounter() {
    // Obtener visitas actuales, si no existe es 0
    let visits = localStorage.getItem('nexus_visits');
    
    if (!visits) {
        visits = 0;
    } else {
        visits = parseInt(visits);
    }
    
    // Solo incrementamos si ya pasamos el login o al cargar? 
    // Lo ideal es incrementar al cargar la página
    visits++;
    
    // Guardar nuevo valor
    localStorage.setItem('nexus_visits', visits);
    
    // Mostrar en UI
    document.getElementById('login-visits').innerText = visits;
    document.getElementById('footer-visits').innerText = visits;
}

// --- LOGIN ---
function initCaptcha() {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    captchaSolution = n1 + n2;
    document.getElementById('captcha-question').innerText = `${n1} + ${n2}`;
    document.getElementById('captcha-input').value = '';
}

function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const captcha = parseInt(document.getElementById('captcha-input').value);
    
    // Validación (Simple para demo)
    if(user === 'admin' && pass === '1234' && captcha === captchaSolution) {
        unlockDashboard();
    } else {
        const err = document.getElementById('login-error');
        err.classList.remove('hidden');
        err.parentElement.classList.add('animate-[bounce_0.5s]');
        setTimeout(() => err.parentElement.classList.remove('animate-[bounce_0.5s]'), 500);
        initCaptcha();
    }
}

function unlockDashboard() {
    const login = document.getElementById('login-screen');
    const dash = document.getElementById('app-dashboard');
    
    login.style.opacity = '0';
    setTimeout(() => {
        login.classList.add('hidden');
        dash.classList.remove('hidden');
        setTimeout(() => {
            dash.style.opacity = '1';
            initSystem(); // INICIAR TODO
        }, 100);
    }, 500);
}

// --- SISTEMA ---
function initSystem() {
    initMap();
    fetchUserISP();
    renderQuickLocations();
    
    // Evento del botón GPS corregido
    document.getElementById('btn-gps').addEventListener('click', activateGPS);
}

function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false })
           .setView([userCoords.lat, userCoords.lng], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

    // Iconos
    const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41]
    });
    const blueIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41]
    });

    // Marcadores
    marker = L.marker([userCoords.lat, userCoords.lng], { icon: redIcon }).addTo(map); // Objetivo
    userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: blueIcon, opacity: 0.7 }).addTo(map); // Usuario

    map.on('click', (e) => analyzeTarget(e.latlng.lat, e.latlng.lng));
    map.on('mousemove', (e) => {
        document.getElementById('live-lat').innerText = e.latlng.lat.toFixed(4);
        document.getElementById('live-lon').innerText = e.latlng.lng.toFixed(4);
    });

    // Carga inicial
    analyzeTarget(40.4168, -3.7038); // Madrid por defecto
}

// --- FUNCIÓN CENTRAL DE ANÁLISIS ---
function analyzeTarget(lat, lng) {
    // 1. Mover marcador rojo
    marker.setLatLng([lat, lng]);
    
    // 2. Calcular Distancia
    const km = getDist(userCoords.lat, userCoords.lng, lat, lng);
    document.getElementById('net-distance').innerText = `${km.toFixed(0)} km`;

    // 3. Ping
    let p = (km * 2) / 100 + 10; 
    if(!isUserLocated) p += 50; // Penalización por no tener GPS preciso
    updatePing(Math.round(p));

    // 4. APIs Externas
    fetchGeo(lat, lng);
    fetchWeather(lat, lng);
}

// --- GPS MEJORADO Y CORREGIDO ---
function activateGPS() {
    const status = document.getElementById('gps-status');
    status.innerText = "Sintonizando satélites...";
    status.className = "text-[10px] text-center text-blue-400 font-mono animate-pulse";

    if (!navigator.geolocation) {
        status.innerText = "Error: Navegador incompatible";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            // ÉXITO
            const { latitude, longitude } = pos.coords;
            userCoords = { lat: latitude, lng: longitude };
            isUserLocated = true;

            // 1. Mover marcador azul (Usuario)
            userMarker.setLatLng([latitude, longitude]);
            userMarker.bindPopup("TU UBICACIÓN EXACTA").openPopup();

            // 2. Volar el mapa hacia ti (Efecto suave)
            map.flyTo([latitude, longitude], 13, { duration: 2 });

            // 3. ¡IMPORTANTE! Actualizar el análisis (Marcador Rojo) a tu ubicación
            // Así ves TU clima, TU ciudad, etc.
            analyzeTarget(latitude, longitude);

            status.innerText = "✓ SEÑAL GPS SINCRONIZADA";
            status.className = "text-[10px] text-center text-emerald-400 font-mono font-bold";
        },
        (err) => {
            // ERROR
            console.error(err);
            let msg = "Error desconocido";
            if(err.code === 1) msg = "Acceso denegado por usuario";
            if(err.code === 2) msg = "Posición no disponible";
            if(err.code === 3) msg = "Tiempo de espera agotado";
            
            status.innerText = `⚠ ${msg}`;
            status.className = "text-[10px] text-center text-red-400 font-mono";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// --- APIs AUXILIARES ---
async function fetchUserISP() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('net-ip').innerText = data.ip || "Oculta";
        document.getElementById('net-isp').innerText = (data.org || data.isp || "Privado").substring(0, 20);
    } catch(e) { document.getElementById('net-isp').innerText = "Modo Offline"; }
}

async function fetchGeo(lat, lng) {
    document.getElementById('detail-country').innerText = "ESCANEANDO...";
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        const data = await res.json();
        const a = data.address;
        
        document.getElementById('detail-city').innerText = a.city || a.town || a.county || "Zona Rural";
        document.getElementById('detail-state').innerText = (a.state || a.region || "").toUpperCase();
        document.getElementById('detail-country').innerText = (a.country || "Desconocido").toUpperCase();
        
        if(a.country_code) {
            const r = await fetch(`https://restcountries.com/v3.1/alpha/${a.country_code}`);
            const d = await r.json();
            const flag = document.getElementById('detail-flag');
            flag.src = d[0].flags.svg;
            flag.classList.remove('hidden');
        }
    } catch(e) {
        document.getElementById('detail-country').innerText = "AGUAS PROFUNDAS";
        document.getElementById('detail-flag').classList.add('hidden');
    }
}

async function fetchWeather(lat, lng) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
        const data = await res.json();
        const w = data.current_weather;
        document.getElementById('temp-display').innerText = `${w.temperature}°`;
        
        const i = document.getElementById('weather-icon');
        const d = document.getElementById('weather-desc');
        
        if(w.temperature > 25) { i.className="fa-solid fa-sun text-yellow-400 text-4xl"; d.innerText="CÁLIDO"; }
        else if(w.temperature < 10) { i.className="fa-solid fa-snowflake text-cyan-300 text-4xl"; d.innerText="FRÍO"; }
        else { i.className="fa-solid fa-cloud text-slate-400 text-4xl"; d.innerText="TEMPLADO"; }
    } catch(e) {}
}

// --- UTILIDADES ---
function updatePing(ms) {
    const bar = document.getElementById('ping-bar');
    const txt = document.getElementById('target-ping');
    txt.innerText = `${ms} ms`;
    
    if(ms < 60) { txt.className="text-2xl font-bold text-emerald-400"; bar.className="bg-emerald-500 h-full transition-all duration-1000"; bar.style.width="95%"; }
    else if(ms < 150) { txt.className="text-2xl font-bold text-yellow-400"; bar.className="bg-yellow-500 h-full transition-all duration-1000"; bar.style.width="60%"; }
    else { txt.className="text-2xl font-bold text-red-500"; bar.className="bg-red-600 h-full transition-all duration-1000"; bar.style.width="30%"; }
}

function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function renderQuickLocations() {
    const locs = [
        { n: 'N. Virginia (AWS)', c: [39.0438, -77.4874] },
        { n: 'Frankfurt (DE)', c: [50.1109, 8.6821] },
        { n: 'Tokyo (JP)', c: [35.6762, 139.6503] },
        { n: 'Sao Paulo (BR)', c: [-23.5505, -46.6333] }
    ];
    const list = document.getElementById('location-list');
    locs.forEach(l => {
        const btn = document.createElement('button');
        btn.className = 'loc-btn';
        btn.innerHTML = `<span>${l.n}</span> <i class="fa-solid fa-server text-xs"></i>`;
        btn.onclick = () => { map.flyTo(l.c, 10); analyzeTarget(l.c[0], l.c[1]); };
        list.appendChild(btn);
    });
}