"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { VoiceState } from "../../lib/hooks/useVoiceSession";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GlobeLang {
  name: string;
  native: string;
  code: string;
}

export interface GlobeSelection {
  country: string;
  language: GlobeLang;
}

interface Country {
  name: string;
  lat: number;
  lon: number;
  languages: GlobeLang[];
}

interface Props {
  /** "interactive": hoverable/clickable globe for language picking.
   *  "session": audio-reactive globe, no interaction. */
  mode: "interactive" | "session";
  voiceState?: VoiceState;
  audioLevel?: number;
  aiAudioLevel?: number;
  selection?: GlobeSelection | null;
  onSelect: (sel: GlobeSelection) => void;
  onClear?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country / Language data
// ─────────────────────────────────────────────────────────────────────────────

const L = (name: string, native: string, code: string): GlobeLang => ({ name, native, code });

const COUNTRIES: Country[] = [
  // Americas
  { name: "United States",    lat:  39, lon:  -98, languages: [L("English","English","en"), L("Spanish","Español","es")] },
  { name: "Canada",           lat:  60, lon:  -95, languages: [L("English","English","en"), L("French","Français","fr")] },
  { name: "Mexico",           lat:  23, lon: -102, languages: [L("Spanish","Español","es")] },
  { name: "Brazil",           lat: -10, lon:  -51, languages: [L("Portuguese","Português","pt")] },
  { name: "Argentina",        lat: -34, lon:  -64, languages: [L("Spanish","Español","es")] },
  { name: "Colombia",         lat:   4, lon:  -74, languages: [L("Spanish","Español","es")] },
  { name: "Peru",             lat:  -9, lon:  -75, languages: [L("Spanish","Español","es"), L("Quechua","Runasimi","qu")] },
  { name: "Venezuela",        lat:   8, lon:  -66, languages: [L("Spanish","Español","es")] },
  { name: "Chile",            lat: -35, lon:  -71, languages: [L("Spanish","Español","es")] },
  { name: "Cuba",             lat:  22, lon:  -80, languages: [L("Spanish","Español","es")] },
  // Europe
  { name: "United Kingdom",   lat:  55, lon:   -3, languages: [L("English","English","en")] },
  { name: "France",           lat:  46, lon:    2, languages: [L("French","Français","fr")] },
  { name: "Germany",          lat:  51, lon:   10, languages: [L("German","Deutsch","de")] },
  { name: "Spain",            lat:  40, lon:   -4, languages: [L("Spanish","Español","es"), L("Catalan","Català","ca")] },
  { name: "Italy",            lat:  41, lon:   12, languages: [L("Italian","Italiano","it")] },
  { name: "Portugal",         lat:  39, lon:   -8, languages: [L("Portuguese","Português","pt")] },
  { name: "Netherlands",      lat:  52, lon:    5, languages: [L("Dutch","Nederlands","nl")] },
  { name: "Sweden",           lat:  62, lon:   15, languages: [L("Swedish","Svenska","sv")] },
  { name: "Norway",           lat:  65, lon:   13, languages: [L("Norwegian","Norsk","no")] },
  { name: "Denmark",          lat:  56, lon:   10, languages: [L("Danish","Dansk","da")] },
  { name: "Finland",          lat:  64, lon:   26, languages: [L("Finnish","Suomi","fi")] },
  { name: "Poland",           lat:  52, lon:   20, languages: [L("Polish","Polski","pl")] },
  { name: "Ukraine",          lat:  49, lon:   32, languages: [L("Ukrainian","Українська","uk")] },
  { name: "Russia",           lat:  60, lon:  100, languages: [L("Russian","Русский","ru")] },
  { name: "Greece",           lat:  39, lon:   22, languages: [L("Greek","Ελληνικά","el")] },
  { name: "Turkey",           lat:  39, lon:   35, languages: [L("Turkish","Türkçe","tr")] },
  { name: "Romania",          lat:  46, lon:   25, languages: [L("Romanian","Română","ro")] },
  { name: "Austria",          lat:  47, lon:   14, languages: [L("German","Deutsch","de")] },
  { name: "Switzerland",      lat:  47, lon:    8, languages: [L("German","Deutsch","de"), L("French","Français","fr")] },
  // Middle East
  { name: "Saudi Arabia",     lat:  24, lon:   45, languages: [L("Arabic","العربية","ar")] },
  { name: "Iran",             lat:  32, lon:   53, languages: [L("Persian","فارسی","fa")] },
  { name: "Iraq",             lat:  33, lon:   44, languages: [L("Arabic","العربية","ar")] },
  { name: "Israel",           lat:  31, lon:   35, languages: [L("Hebrew","עברית","he"), L("Arabic","العربية","ar")] },
  { name: "UAE",              lat:  24, lon:   54, languages: [L("Arabic","العربية","ar")] },
  // South Asia
  { name: "India",            lat:  20, lon:   77, languages: [L("Hindi","हिन्दी","hi"), L("English","English","en"), L("Tamil","தமிழ்","ta"), L("Bengali","বাংলা","bn"), L("Telugu","తెలుగు","te")] },
  { name: "Pakistan",         lat:  30, lon:   69, languages: [L("Urdu","اردو","ur"), L("English","English","en")] },
  { name: "Bangladesh",       lat:  23, lon:   90, languages: [L("Bengali","বাংলা","bn")] },
  { name: "Sri Lanka",        lat:   8, lon:   81, languages: [L("Sinhala","සිංහල","si"), L("Tamil","தமிழ்","ta")] },
  // East Asia
  { name: "China",            lat:  35, lon:  103, languages: [L("Mandarin","普通话","zh"), L("Cantonese","粵語","yue")] },
  { name: "Japan",            lat:  36, lon:  138, languages: [L("Japanese","日本語","ja")] },
  { name: "South Korea",      lat:  36, lon:  128, languages: [L("Korean","한국어","ko")] },
  { name: "Taiwan",           lat:  24, lon:  121, languages: [L("Mandarin","普通話","zh")] },
  // Southeast Asia
  { name: "Indonesia",        lat:  -1, lon:  117, languages: [L("Indonesian","Bahasa Indonesia","id")] },
  { name: "Vietnam",          lat:  16, lon:  107, languages: [L("Vietnamese","Tiếng Việt","vi")] },
  { name: "Thailand",         lat:  15, lon:  101, languages: [L("Thai","ภาษาไทย","th")] },
  { name: "Philippines",      lat:  12, lon:  122, languages: [L("Filipino","Filipino","fil"), L("English","English","en")] },
  { name: "Malaysia",         lat:   3, lon:  109, languages: [L("Malay","Bahasa Melayu","ms")] },
  // Central Asia
  { name: "Kazakhstan",       lat:  48, lon:   68, languages: [L("Kazakh","Қазақша","kk"), L("Russian","Русский","ru")] },
  { name: "Afghanistan",      lat:  34, lon:   65, languages: [L("Dari","دری","prs"), L("Pashto","پښتو","ps")] },
  // Africa
  { name: "Nigeria",          lat:   9, lon:    8, languages: [L("English","English","en"), L("Hausa","Hausa","ha"), L("Yoruba","Yorùbá","yo")] },
  { name: "Ethiopia",         lat:   9, lon:   40, languages: [L("Amharic","አማርኛ","am")] },
  { name: "Egypt",            lat:  26, lon:   30, languages: [L("Arabic","العربية","ar")] },
  { name: "South Africa",     lat: -29, lon:   25, languages: [L("Zulu","isiZulu","zu"), L("Afrikaans","Afrikaans","af"), L("English","English","en")] },
  { name: "Kenya",            lat:  -1, lon:   37, languages: [L("Swahili","Kiswahili","sw"), L("English","English","en")] },
  { name: "Tanzania",         lat:  -6, lon:   35, languages: [L("Swahili","Kiswahili","sw")] },
  { name: "Ghana",            lat:   8, lon:   -1, languages: [L("English","English","en")] },
  { name: "Morocco",          lat:  32, lon:   -6, languages: [L("Arabic","العربية","ar"), L("French","Français","fr")] },
  { name: "Algeria",          lat:  28, lon:    3, languages: [L("Arabic","العربية","ar"), L("French","Français","fr")] },
  { name: "DR Congo",         lat:  -3, lon:   23, languages: [L("French","Français","fr"), L("Lingala","Lingála","ln")] },
  { name: "Senegal",          lat:  14, lon:  -14, languages: [L("French","Français","fr")] },
  { name: "Cameroon",         lat:   6, lon:   12, languages: [L("French","Français","fr"), L("English","English","en")] },
  // Oceania
  { name: "Australia",        lat: -25, lon:  133, languages: [L("English","English","en")] },
  { name: "New Zealand",      lat: -41, lon:  174, languages: [L("English","English","en"), L("Māori","Te Reo Māori","mi")] },
];

// Language connection chains (for arc rendering)
const LANG_CHAINS: string[][] = [
  ["United States","Mexico","Venezuela","Colombia","Peru","Argentina","Spain"],    // es
  ["Saudi Arabia","Iraq","Egypt","Morocco","Algeria"],                             // ar
  ["France","Morocco","Algeria","DR Congo","Senegal"],                            // fr
  ["Brazil","Portugal"],                                                           // pt
  ["Russia","Kazakhstan"],                                                         // ru
  ["United States","United Kingdom","India","Australia","South Africa"],           // en hubs
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function latLonToVec3(lat: number, lon: number, r = 1.0): THREE.Vector3 {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

function greatCircleDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * R) / 2) ** 2 +
    Math.cos(lat1 * R) * Math.cos(lat2 * R) * Math.sin(((lon2 - lon1) * R) / 2) ** 2;
  return Math.acos(Math.max(-1, Math.min(1, 1 - 2 * a))) * (180 / Math.PI);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ─────────────────────────────────────────────────────────────────────────────
// Land detection — simplified continent polygons [lat, lon]
// ─────────────────────────────────────────────────────────────────────────────

const CONTINENT_POLYS: [number, number][][] = [
  // North America
  [[72,-140],[65,-168],[58,-166],[55,-130],[48,-125],[37,-122],[22,-110],[10,-85],[8,-77],[20,-75],[25,-80],[35,-75],[42,-70],[47,-53],[55,-55],[62,-64],[68,-78],[72,-95]],
  // Greenland
  [[83,-50],[76,-15],[68,-24],[64,-50],[68,-52],[76,-58]],
  // South America
  [[10,-75],[7,-62],[0,-50],[-5,-35],[-10,-37],[-23,-43],[-35,-58],[-55,-68],[-42,-72],[-18,-70],[-5,-82],[5,-78]],
  // Europe
  [[36,-8],[40,0],[44,4],[48,2],[52,5],[55,-2],[58,-4],[56,22],[58,24],[62,28],[68,18],[72,26],[70,50],[60,32],[48,37],[44,36],[42,28],[42,18],[42,12],[44,8],[40,0],[38,-8]],
  // Africa
  [[37,10],[36,36],[22,38],[12,44],[0,42],[-5,40],[-18,36],[-35,26],[-35,18],[-10,15],[-5,10],[0,6],[5,2],[5,-5],[10,-15],[14,-17],[18,-16],[22,-14],[30,-10],[34,-6],[36,4]],
  // Asia (including Middle East, South & East Asia)
  [[72,26],[72,130],[68,176],[60,176],[55,142],[50,142],[42,133],[36,122],[28,121],[22,114],[0,103],[-5,105],[5,100],[10,98],[15,100],[22,100],[28,97],[20,87],[8,78],[22,60],[30,58],[14,44],[0,42],[12,44],[22,38],[36,36],[37,36],[41,42],[44,40],[48,40],[55,24],[62,28],[68,30],[72,34]],
  // Southeast Asia islands (Indonesia / Philippines approximation)
  [[-8,95],[-8,141],[-1,141],[-1,95]],
  // Australia
  [[-12,130],[-12,136],[-12,142],[-18,148],[-25,153],[-32,153],[-38,147],[-38,140],[-38,130],[-32,116],[-26,114],[-22,114],[-16,122]],
  // Japan
  [[31,130],[31,142],[45,142],[45,140],[42,130],[36,130]],
  // British Isles
  [[50,-5],[50,2],[58,2],[58,-5]],
  // Iceland
  [[64,-25],[64,-12],[66,-12],[66,-25]],
];

function pointInPoly(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [lati, loni] = poly[i];
    const [latj, lonj] = poly[j];
    if ((loni > lon) !== (lonj > lon) &&
        lat < (latj - lati) * (lon - loni) / (lonj - loni) + lati) {
      inside = !inside;
    }
  }
  return inside;
}

function isLand(lat: number, lon: number): boolean {
  return CONTINENT_POLYS.some(poly => pointInPoly(lat, lon, poly));
}

// ─────────────────────────────────────────────────────────────────────────────
// Point cloud colors
// ─────────────────────────────────────────────────────────────────────────────

const COL_DEFAULT:  readonly [number, number, number] = [0.38, 0.52, 0.78];  // mid blue-white
const COL_HOVER:    readonly [number, number, number] = [0.20, 0.82, 1.00];  // bright cyan
const COL_SELECTED: readonly [number, number, number] = [0.90, 0.96, 1.00];  // near-white

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function GlobeScene({
  mode,
  voiceState = "idle",
  audioLevel = 0,
  aiAudioLevel = 0,
  selection,
  onSelect,
  onClear,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Live refs for animation loop (avoids stale closures)
  const modeRef   = useRef(mode);
  const vsRef     = useRef(voiceState);
  const aiRef     = useRef(aiAudioLevel);
  const micRef    = useRef(audioLevel);
  const selRef    = useRef<GlobeSelection | null>(selection ?? null);
  const hovCurRef = useRef(-1);
  // Tracks current globe rotation so mouse handler can compensate lon offset
  const rotYRef   = useRef(0);

  useEffect(() => { modeRef.current = mode;          }, [mode]);
  useEffect(() => { vsRef.current   = voiceState;    }, [voiceState]);
  useEffect(() => { aiRef.current   = aiAudioLevel;  }, [aiAudioLevel]);
  useEffect(() => { micRef.current  = audioLevel;    }, [audioLevel]);
  useEffect(() => { selRef.current  = selection ?? null; }, [selection]);

  // React UI state
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [panelIdx,   setPanelIdx]   = useState(-1);

  // Three.js handles exposed to mouse handlers
  const threeRef = useRef<{
    globe:         THREE.Mesh | null;
    camera:        THREE.Camera | null;
    colorsAttr:    THREE.BufferAttribute | null;
    countryPoints: number[][];
    pointsMat:     THREE.PointsMaterial | null;
    pointCloud:    THREE.Points | null;
    group:         THREE.Group | null;
  }>({ globe: null, camera: null, colorsAttr: null, countryPoints: [], pointsMat: null, pointCloud: null, group: null });

  // ── Scene setup (runs once) ───────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth  || 600;
    const H = el.clientHeight || 600;

    // ── Renderer ──────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x010208, 1);
    el.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0, 2.6);
    camera.lookAt(0, 0, 0);
    threeRef.current.camera = camera;

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      (camera as THREE.PerspectiveCamera).aspect = w / h;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Rotating group (globe + points + arcs all spin together) ──
    const group = new THREE.Group();
    scene.add(group);
    threeRef.current.group = group;

    // ── Invisible sphere — only for raycasting ────────────────
    const globeGeo = new THREE.SphereGeometry(1.0, 64, 48);
    const globeMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0, depthWrite: false });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    group.add(globe);
    threeRef.current.globe = globe;

    // ── Land point cloud generation ───────────────────────────
    const positions: number[] = [];
    const colors:    number[] = [];
    const ptCountry: number[] = [];  // country index per point (-1 = none)

    const rng = () => Math.random();

    for (let latDeg = -89; latDeg <= 89; latDeg += 1) {
      for (let lonDeg = -179; lonDeg <= 179; lonDeg += 2) {
        // jitter within cell
        const jLat = latDeg + (rng() - 0.5) * 1.6;
        const jLon = lonDeg + (rng() - 0.5) * 1.6;

        if (!isLand(jLat, jLon)) continue;

        // Spherical → Cartesian (r = 1.005 so points sit just above surface)
        const phi   = (90 - jLat) * (Math.PI / 180);
        const theta = (jLon + 180) * (Math.PI / 180);
        const r = 1.005;
        positions.push(
          -r * Math.sin(phi) * Math.cos(theta),
           r * Math.cos(phi),
           r * Math.sin(phi) * Math.sin(theta),
        );
        colors.push(COL_DEFAULT[0], COL_DEFAULT[1], COL_DEFAULT[2]);

        // Assign to nearest country centroid (within 22° great circle)
        let nearIdx = -1, nearDist = Infinity;
        COUNTRIES.forEach((c, ci) => {
          const d = greatCircleDeg(jLat, jLon, c.lat, c.lon);
          if (d < nearDist) { nearDist = d; nearIdx = ci; }
        });
        ptCountry.push(nearDist < 22 ? nearIdx : -1);
      }
    }

    // Build reverse index: countryIdx → point indices
    const countryPoints: number[][] = COUNTRIES.map(() => []);
    ptCountry.forEach((ci, pi) => {
      if (ci >= 0) countryPoints[ci].push(pi);
    });

    const posArr = new Float32Array(positions);
    const colArr = new Float32Array(colors);

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    const colorsAttr = new THREE.BufferAttribute(colArr, 3);
    pointsGeo.setAttribute("color", colorsAttr);

    const pointsMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.026,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const pointCloud = new THREE.Points(pointsGeo, pointsMat);
    group.add(pointCloud);

    Object.assign(threeRef.current, { colorsAttr, countryPoints, pointsMat, pointCloud });

    // Helper: paint all points of a country with a given RGB
    const setCountryColor = (
      ci: number,
      col: readonly [number, number, number],
    ) => {
      const pts = countryPoints[ci];
      if (!pts?.length) return;
      const arr = colArr;
      for (let k = 0; k < pts.length; k++) {
        const base = pts[k] * 3;
        arr[base]     = col[0];
        arr[base + 1] = col[1];
        arr[base + 2] = col[2];
      }
    };

    // ── Language arcs (subtle, rotate with group) ─────────────
    LANG_CHAINS.forEach((chain) => {
      for (let k = 0; k < chain.length - 1; k++) {
        const ai = COUNTRIES.findIndex(c => c.name === chain[k]);
        const bi = COUNTRIES.findIndex(c => c.name === chain[k + 1]);
        if (ai < 0 || bi < 0) continue;
        const from = latLonToVec3(COUNTRIES[ai].lat, COUNTRIES[ai].lon, 1.015);
        const to   = latLonToVec3(COUNTRIES[bi].lat, COUNTRIES[bi].lon, 1.015);
        const mid  = from.clone().add(to).normalize().multiplyScalar(1.35);
        const pts  = new THREE.QuadraticBezierCurve3(from, mid, to).getPoints(36);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.055,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })));
      }
    });

    // ── Fresnel atmosphere (fixed, not in group) ──────────────
    const fresnelVS = `
      varying vec3 vNorm;
      varying vec3 vPos;
      void main() {
        vNorm = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vPos = mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `;

    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: fresnelVS,
      fragmentShader: `
        varying vec3 vNorm;
        varying vec3 vPos;
        void main() {
          float rim = 1.0 - max(0.0, dot(normalize(vNorm), normalize(-vPos)));
          rim = pow(rim, 2.6);
          gl_FragColor = vec4(0.50, 0.70, 1.00, rim * 0.60);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.11, 48, 36), atmosMat));

    const outerMat = new THREE.ShaderMaterial({
      vertexShader: fresnelVS,
      fragmentShader: `
        varying vec3 vNorm;
        varying vec3 vPos;
        void main() {
          float rim = 1.0 - max(0.0, dot(normalize(vNorm), normalize(-vPos)));
          rim = pow(rim, 4.5);
          gl_FragColor = vec4(0.30, 0.52, 1.00, rim * 0.20);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.22, 32, 24), outerMat));

    // ── Sparse star field ─────────────────────────────────────
    {
      const N = 180;
      const sp = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const r  = 5 + Math.random() * 7;
        sp[i*3]   = r * Math.sin(ph) * Math.cos(th);
        sp[i*3+1] = r * Math.sin(ph) * Math.sin(th);
        sp[i*3+2] = r * Math.cos(ph);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0x8899CC,
        size: 0.018,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })));
    }

    // ── Animation loop ────────────────────────────────────────
    let frameId = 0;
    let rotY    = 0;
    let prevHovI = -1;
    let prevSelI = -1;

    function animate() {
      frameId = requestAnimationFrame(animate);

      const hovI       = hovCurRef.current;
      const curSel     = selRef.current;
      const selIdx     = curSel
        ? COUNTRIES.findIndex(c => c.name === curSel.country)
        : -1;
      const isSess     = modeRef.current === "session";
      const ai         = aiRef.current;
      const st         = vsRef.current;
      const isSpeaking = st === "speaking";
      const isListening = st === "listening";

      // Rotation
      const rotSpeed = isSess
        ? (isSpeaking ? 0.0006 + ai * 0.0014 : 0.0004)
        : 0.00055;
      rotY += rotSpeed;
      group.rotation.y = rotY;
      rotYRef.current  = rotY;

      // Audio-reactive point size / opacity (session mode)
      const tOpacity = isSess
        ? (isSpeaking ? 0.92 + ai * 0.08 : isListening ? 0.88 : 0.82)
        : 0.88;
      pointsMat.opacity = lerp(pointsMat.opacity, tOpacity, 0.06);

      const tSize = isSess
        ? (isSpeaking ? 0.026 + ai * 0.008 : 0.026)
        : 0.026;
      pointsMat.size = lerp(pointsMat.size, tSize, 0.07);

      // Update vertex colors when hover / selection changes
      if (hovI !== prevHovI || selIdx !== prevSelI) {
        // Restore previous hover (if it was not selected)
        if (prevHovI >= 0 && prevHovI !== prevSelI) {
          setCountryColor(prevHovI, COL_DEFAULT);
        }
        // Restore previous selection
        if (prevSelI >= 0 && prevSelI !== selIdx) {
          setCountryColor(prevSelI, prevSelI === hovI ? COL_HOVER : COL_DEFAULT);
        }
        // Apply new hover (if not also selected)
        if (hovI >= 0 && hovI !== selIdx) {
          setCountryColor(hovI, COL_HOVER);
        }
        // Apply new selection (always top priority)
        if (selIdx >= 0) {
          setCountryColor(selIdx, COL_SELECTED);
        }
        colorsAttr.needsUpdate = true;
        prevHovI = hovI;
        prevSelI = selIdx;
      }

      // Camera gentle float
      camera.position.x = Math.sin(Date.now() * 0.00009) * 0.05;
      camera.position.y = Math.cos(Date.now() * 0.00006) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      threeRef.current = {
        globe: null, camera: null, colorsAttr: null,
        countryPoints: [], pointsMat: null, pointCloud: null, group: null,
      };
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse interaction ─────────────────────────────────────
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVec     = useRef(new THREE.Vector2());

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (modeRef.current !== "interactive") return;
    const el = mountRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseVec.current.set(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
    const { globe, camera } = threeRef.current;
    if (!globe || !camera) return;
    raycasterRef.current.setFromCamera(mouseVec.current, camera);
    const hits = raycasterRef.current.intersectObject(globe);
    if (hits.length > 0 && hits[0].uv) {
      const uv    = hits[0].uv;
      const lat   = (0.5 - uv.y) * 180;
      // UV is in globe local-space; compensate for current rotation to get world lon
      const rotDeg = rotYRef.current * (180 / Math.PI);
      const lon   = (uv.x - 0.5) * 360 + rotDeg;
      let nearIdx = -1, nearDist = Infinity;
      COUNTRIES.forEach((c, i) => {
        const d = greatCircleDeg(lat, lon, c.lat, c.lon);
        if (d < nearDist) { nearDist = d; nearIdx = i; }
      });
      const idx = nearDist < 14 ? nearIdx : -1;
      hovCurRef.current = idx;
      setHoveredIdx(idx);
    } else {
      hovCurRef.current = -1;
      setHoveredIdx(-1);
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    hovCurRef.current = -1;
    setHoveredIdx(-1);
  }, []);

  const onClick = useCallback(() => {
    if (modeRef.current !== "interactive") return;
    if (hovCurRef.current >= 0) {
      setPanelIdx(hovCurRef.current);
    } else {
      setPanelIdx(-1);
    }
  }, []);

  // ── Derived ───────────────────────────────────────────────
  const hoveredCountry = hoveredIdx >= 0 ? COUNTRIES[hoveredIdx] : null;
  const panelCountry   = panelIdx   >= 0 ? COUNTRIES[panelIdx]   : null;
  const isInteractive  = mode === "interactive";
  const isSession      = mode === "session";

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "rgb(1,2,8)", borderRadius: "inherit" }}>

      {/* Three.js canvas host */}
      <div
        ref={mountRef}
        style={{
          position: "absolute", inset: 0,
          cursor: isInteractive ? (hoveredCountry ? "pointer" : "grab") : "default",
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />

      {/* Hover tooltip (interactive mode, no panel open) */}
      {isInteractive && hoveredCountry && panelIdx < 0 && (
        <div style={{
          position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
          background: "rgba(7,7,11,0.92)", border: "1px solid rgba(95,227,255,0.22)",
          backdropFilter: "blur(16px)", borderRadius: 12,
          padding: "6px 16px", pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap",
          boxShadow: "0 4px 20px rgba(95,227,255,0.10)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
            {hoveredCountry.name}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(95,227,255,0.65)", letterSpacing: "0.04em" }}>
            click to pick language
          </span>
        </div>
      )}

      {/* Language panel (interactive mode) */}
      {isInteractive && panelCountry && (
        <div style={{
          position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
          width: 214, maxHeight: "78%", overflowY: "auto",
          background: "rgba(7,7,11,0.93)", border: "1px solid rgba(95,227,255,0.20)",
          backdropFilter: "blur(22px)", borderRadius: 18, padding: "16px 14px",
          zIndex: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,255,255,0.94)" }}>
                {panelCountry.name}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(95,227,255,0.60)", marginTop: 3 }}>
                Select language
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setPanelIdx(-1); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.32)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}
            >
              ×
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {panelCountry.languages.map((lang) => {
              const active = selection?.language.code === lang.code && selection?.country === panelCountry.name;
              return (
                <button
                  key={lang.code}
                  onClick={() => { onSelect({ country: panelCountry.name, language: lang }); setPanelIdx(-1); }}
                  style={{
                    background: active ? "rgba(95,227,255,0.11)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${active ? "rgba(95,227,255,0.32)" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left",
                    transition: "background 0.14s, border-color 0.14s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(95,227,255,0.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? "rgba(95,227,255,0.11)" : "rgba(255,255,255,0.03)"; }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: active ? "rgba(95,227,255,0.95)" : "rgba(255,255,255,0.86)" }}>
                    {lang.name}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.36)", marginTop: 2 }}>
                    {lang.native}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Instruction hint — interactive mode, nothing selected */}
      {isInteractive && !selection && hoveredIdx < 0 && (
        <div style={{
          position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.22)", pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          Rotate & click a country to set language
        </div>
      )}

      {/* Active selection chip — interactive mode */}
      {isInteractive && selection && (
        <div style={{
          position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 7, zIndex: 10,
          background: "rgba(95,227,255,0.09)", border: "1px solid rgba(95,227,255,0.28)",
          backdropFilter: "blur(12px)", borderRadius: 999, padding: "6px 13px",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(95,227,255,1)", boxShadow: "0 0 7px rgba(95,227,255,0.9)" }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(95,227,255,0.94)" }}>
            {selection.language.name}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.38)" }}>
            · {selection.country}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onClear?.(); }}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.28)", cursor: "pointer", fontSize: 14, padding: "0 2px", marginLeft: 2 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Session mode: language + country indicator */}
      {isSession && selection && (
        <div style={{
          position: "absolute", top: 14, right: 14, zIndex: 10,
          display: "flex", alignItems: "center", gap: 7,
          background: "rgba(7,7,11,0.78)", border: "1px solid rgba(95,227,255,0.18)",
          backdropFilter: "blur(12px)", borderRadius: 999, padding: "5px 12px 5px 8px",
          boxShadow: "0 0 16px rgba(95,227,255,0.07)",
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(95,227,255,0.9)", boxShadow: "0 0 6px rgba(95,227,255,0.65)" }} />
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.86)" }}>
            {selection.language.name}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.32)" }}>
            · {selection.country}
          </div>
        </div>
      )}
    </div>
  );
}
