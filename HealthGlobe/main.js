import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { drawThreeGeo } from "./src/threeGeoJSON.js";
import { VRButton } from 'jsm/webxr/VRButton.js';
import { ARButton } from 'jsm/webxr/ARButton.js';
import { XRControllerModelFactory } from 'jsm/webxr/XRControllerModelFactory.js';

// =====================================================
//   SZENE, KAMERA, XR-RIG, RENDERER
// =====================================================

const scene = new THREE.Scene();

// Perspektivische Kamera
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 4, 10);
camera.lookAt(0, 0, 0);

// XR-Rig (repräsentiert die Spielerposition im Raum)
// -> In VR/AR bewegt man idealerweise das Rig, in diesem Projekt
//    bewegen wir aber den Globus für die "Bewegung".
const xrRig = new THREE.Group();
xrRig.position.set(0, 0, 0);
xrRig.add(camera);
scene.add(xrRig);

// WebGL-Renderer mit WebXR-Unterstützung
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

// OrbitControls (für Desktop-/2D-Modus, nicht im Headset)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 20;
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed *= 0.25;
controls.target.set(0, 0, 0);
controls.update();

// =====================================================
//   WEBXR: SESSIONSTART / SESSIONEND (AR-Hintergrund)
// =====================================================

let oldBackground = scene.background;
let isARSession = false;

renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  // Wenn AR: Hintergrund transparent machen, damit reale Welt sichtbar ist
  if (session && session.environmentBlendMode && session.environmentBlendMode !== 'opaque') {
    isARSession = true;
    oldBackground = scene.background;
    scene.background = null;
  } else {
    isARSession = false;
  }
});

renderer.xr.addEventListener('sessionend', () => {
  // Hintergrund bei AR wiederherstellen
  if (isARSession) {
    scene.background = oldBackground;
    isARSession = false;
  }
});

// =====================================================
//   WEBXR-BUTTONS (VR + AR)
// =====================================================

const vrButton = VRButton.createButton(renderer);
vrButton.style.position = 'absolute';
vrButton.style.bottom   = '20px';
vrButton.style.left     = '20px';
vrButton.style.zIndex   = '999';
vrButton.style.width    = '140px';
document.body.appendChild(vrButton);

const arButton = ARButton.createButton(renderer, {
  requiredFeatures: [],
  optionalFeatures: ['local-floor']
});
arButton.style.position = 'absolute';
arButton.style.bottom   = '70px';
arButton.style.left     = '20px';
arButton.style.zIndex   = '999';
arButton.style.width    = '140px';
document.body.appendChild(arButton);

// =====================================================
//   SHADER FÜR ERDE + ATMOSPHÄRE
// =====================================================

const vertexShader = `
  varying vec2 vertexUV;
  varying vec3 vertexNormal;

  void main() {
    vertexUV = uv;
    vertexNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D globeTexture;
  varying vec2 vertexUV;
  varying vec3 vertexNormal;

  void main() {
    float intensity = 1.05 - dot(vertexNormal, vec3(0.0, 0.0, 1.0));
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 1.5);
    gl_FragColor = vec4(atmosphere + texture2D(globeTexture, vertexUV).xyz, 1.0);
  }
`;

const vertexShaderAtmosphere = `
  varying vec3 vertexNormal;

  void main() {
    vertexNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentDayShaderAtmosphere = `
  varying vec3 vertexNormal;

  void main() {
    float intensity = pow(0.55 - dot(vertexNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
  }
`;

const fragmentNightShaderAtmosphere = `
  varying vec3 vertexNormal;

  void main() {
    float intensity = pow(0.4 - dot(vertexNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0) * intensity;
  }
`;

// =====================================================
//   ERDKUGEL + ATMOSPHÄREN
// =====================================================

const daySphere = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 50, 50),
  new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      globeTexture: {
        value: new THREE.TextureLoader().load("./src/globe.jpg")
      }
    }
  })
);

const nightSphere = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 50, 50),
  new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      globeTexture: {
        value: new THREE.TextureLoader().load("//unpkg.com/three-globe/example/img/earth-night.jpg")
      }
    }
  })
);

const dayAtmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(3.0, 50, 50),
  new THREE.ShaderMaterial({
    vertexShader: vertexShaderAtmosphere,
    fragmentShader: fragmentDayShaderAtmosphere,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
);

const nightAtmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 50, 50),
  new THREE.ShaderMaterial({
    vertexShader: vertexShaderAtmosphere,
    fragmentShader: fragmentNightShaderAtmosphere,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  })
);

// Wireframe-Kugel für Länder-Konturen
const geometry = new THREE.SphereGeometry(2.5, 64, 64);
const lineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  opacity: 0.5,
  transparent: true,
});
const edges = new THREE.EdgesGeometry(geometry);
const line = new THREE.LineSegments(edges, lineMat);

// Globus-Gruppe (enthält Erde + Atmosphären + Länder + Poles)
const globe = new THREE.Group();

// Globus vor den Benutzer setzen (nicht im Kopf)
globe.position.set(0, 0, -6);
scene.add(globe);

globe.add(dayAtmosphere);
globe.add(daySphere);

// OrbitControls auf Globus ausrichten (nur Desktop)
controls.target.copy(globe.position);
controls.update();

// =====================================================
//   HINTERGRUND (SPACE)
// =====================================================

const loader = new THREE.TextureLoader();
loader.load(
  'https://cdn.glitch.com/0f2dd307-0d28-4fe9-9ef9-db84277033dd%2Fhdr3.png?v=1620582677695',
  (texture1) => {
    const rt = new THREE.WebGLCubeRenderTarget(texture1.image.height);
    texture1.colorSpace = THREE.SRGBColorSpace;
    rt.fromEquirectangularTexture(renderer, texture1);
    scene.background = rt.texture;
  }
);

// =====================================================
//   DAY/NIGHT-MODUS BUTTON
// =====================================================

const toggleButton = document.getElementById('toggleMode');
let isNightMode = false;

toggleButton.addEventListener('click', () => {
  if (isNightMode) {
    globe.remove(nightSphere);
    globe.add(daySphere);
    globe.remove(nightAtmosphere);
    globe.add(dayAtmosphere);
    toggleButton.innerText = 'Night Mode';
  } else {
    globe.remove(daySphere);
    globe.add(nightSphere);
    globe.remove(dayAtmosphere);
    globe.add(nightAtmosphere);
    toggleButton.innerText = 'Day Mode';
  }
  isNightMode = !isNightMode;
});

// =====================================================
//   STERNE (Hintergrund-Punktewolke)
// =====================================================

function addStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.02,
    transparent: true,
    opacity: 0.8,
  });

  const starCount = 2000;
  const starPositions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3]     = (Math.random() - 0.5) * 80;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 80;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }

  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}
addStars();

// =====================================================
//   GEOJSON + POLES (Länder-Punkte)
// =====================================================

const raycaster = new THREE.Raycaster();
raycaster.far = 50;
const mouse = new THREE.Vector2();
const interactiveObjects = []; // alle Poles
const allPoles = [];           // für Covid an/aus

// Lat/Lon → 3D-Position auf Kugel
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y =  radius * Math.cos(phi);
  const z =  radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

// Einen "Pole" (Zylinder) zu einem Land hinzufügen
function addPole(lat, lon, radius, countryCode) {
  const poleHeight = 0.6;
  const poleRadius = 0.02;

  const start = latLonToVector3(lat, lon, radius);
  const end   = latLonToVector3(lat, lon, radius + poleHeight);

  const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 8);
  const poleMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.5
  });

  const pole = new THREE.Mesh(poleGeometry, poleMaterial);

  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  pole.position.copy(midpoint);

  pole.lookAt(end);
  pole.rotateX(Math.PI / 2);

  pole.userData = { isoCode: countryCode };
  interactiveObjects.push(pole);
  allPoles.push(pole);
  globe.add(pole);
}

// GeoJSON laden und Länder + Poles erzeugen
fetch('./geojson/countries.json')
  .then(response => response.text())
  .then(text => {
    const data = JSON.parse(text);

    const countries = drawThreeGeo({
      json: data,
      radius: 2.5,
      materialOptions: { color: 0xffffff },
    });

    const toggleWireframeButton = document.getElementById('toggleWireframe');
    let isWireframe = false;

    // Button: Wireframe an/aus (Länderumrisse vs. Textur)
    toggleWireframeButton.addEventListener('click', () => {
      if (isWireframe) {
        globe.remove(line);
        globe.remove(countries);
        if (isNightMode) {
          globe.add(nightSphere);
          globe.add(nightAtmosphere);
        } else {
          globe.add(daySphere);
          globe.add(dayAtmosphere);
        }
        toggleWireframeButton.innerText = 'Wireframe : OFF';
      } else {
        if (isNightMode) {
          globe.remove(nightSphere);
          globe.remove(nightAtmosphere);
        } else {
          globe.remove(daySphere);
          globe.remove(dayAtmosphere);
        }
        globe.add(line);
        globe.add(countries);
        toggleWireframeButton.innerText = 'Wireframe : ON';
      }
      isWireframe = !isWireframe;
    });

    // Für jedes Land den Schwerpunkt berechnen und Pole setzen
    data.features.forEach(feature => {
      const { iso_a3 } = feature.properties;

      if (feature.geometry.type === "Polygon") {
        const centroid = feature.geometry.coordinates[0].reduce((acc, coord) => {
          acc[0] += coord[0];
          acc[1] += coord[1];
          return acc;
        }, [0, 0]).map(c => c / feature.geometry.coordinates[0].length);

        addPole(centroid[1], centroid[0], 2.5, iso_a3);
      }

      if (feature.geometry.type === "MultiPolygon") {
        feature.geometry.coordinates.forEach(polygon => {
          const centroid = polygon[0].reduce((acc, coord) => {
            acc[0] += coord[0];
            acc[1] += coord[1];
            return acc;
          }, [0, 0]).map(c => c / polygon[0].length);

          addPole(centroid[1], centroid[0], 2.5, iso_a3);
        });
      }
    });
  });

// =====================================================
//   COVID-API + INFOBOX (HTML) + 3D-UI PANEL
// =====================================================

const covidCache = new Map();

// Daten für ein Land von der COVID-API holen (mit Cache)
function fetchCovidData(isoCode) {
  if (covidCache.has(isoCode)) {
    return Promise.resolve(covidCache.get(isoCode));
  }
  return fetch(`https://disease.sh/v3/covid-19/countries/${isoCode}`)
    .then(response => response.json())
    .then(data => {
      covidCache.set(isoCode, data);
      return data;
    })
    .catch(error => console.error(`Error fetching data for ${isoCode}:`, error));
}

// HTML-Infobox (nur auf Desktop/Monitor wirklich sichtbar)
const infoBox = document.createElement('div');
infoBox.style.position = 'absolute';
infoBox.style.top = '10px';
infoBox.style.right = '10px';
infoBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
infoBox.style.color = 'white';
infoBox.style.padding = '10px';
infoBox.style.borderRadius = '5px';
infoBox.style.display = 'none';
infoBox.style.zIndex = '999';
document.body.appendChild(infoBox);

// Canvas für 3D-UI-Panel (im Headset sichtbar)
const uiCanvas = document.createElement('canvas');
uiCanvas.width = 512;
uiCanvas.height = 256;
const uiCtx = uiCanvas.getContext('2d');

const uiTexture = new THREE.CanvasTexture(uiCanvas);
const uiMaterial = new THREE.MeshBasicMaterial({
  map: uiTexture,
  transparent: true
});
const uiGeometry = new THREE.PlaneGeometry(2.4, 1.2);
const uiPanel = new THREE.Mesh(uiGeometry, uiMaterial);

// Panel vor der Kamera (im Kamerakoordinatensystem)
uiPanel.position.set(0, 1.0, -3);
camera.add(uiPanel);

// Hilfsfunktion: ISO2-Code ("FR") → Emoji-Flagge (🇫🇷)
function iso2ToFlagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '';
  const codePoints = iso2
    .toUpperCase()
    .split('')
    .map(c => 0x1F1E6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

// Panel leeren und Standard-Text anzeigen
function clearUIPanel() {
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  uiCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  uiCtx.fillRect(0, 0, uiCanvas.width, uiCanvas.height);
  uiCtx.fillStyle = 'white';
  uiCtx.font = '28px Arial';
  uiCtx.textAlign = 'center';
  uiCtx.fillText('Select a country by pointing at a pole', uiCanvas.width / 2, uiCanvas.height / 2);
  uiTexture.needsUpdate = true;
}

// Panel mit COVID-Daten zeichnen (inkl. Emoji-Flagge)
function drawUIPanel(data) {
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);

  // Hintergrundfläche
  uiCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  uiCtx.fillRect(0, 0, uiCanvas.width, uiCanvas.height);

  uiCtx.fillStyle = 'white';
  uiCtx.textAlign = 'left';

  // Emoji-Flagge aus ISO2-Code
  const iso2 = data.countryInfo?.iso2 || '';
  const flagEmoji = iso2ToFlagEmoji(iso2);

  // Titelzeile: Flagge + Ländername
  uiCtx.font = '32px Arial';
  let title = data.country || 'Unknown';
  if (flagEmoji) {
    title = `${flagEmoji}  ${title}`;
  }
  uiCtx.fillText(title, 20, 50);

  // Textzeilen mit Kennzahlen
  uiCtx.font = '22px Arial';
  let y = 90;
  const lineHeight = 32;

  const lines = [
    `Population: ${data.population?.toLocaleString?.() || 'n/a'}`,
    `Cases: ${data.cases?.toLocaleString?.() || 'n/a'}`,
    `Deaths: ${data.deaths?.toLocaleString?.() || 'n/a'}`,
    `Recovered: ${data.recovered?.toLocaleString?.() || 'n/a'}`,
    `Active: ${data.active?.toLocaleString?.() || 'n/a'}`,
    `Critical: ${data.critical?.toLocaleString?.() || 'n/a'}`
  ];

  for (const line of lines) {
    uiCtx.fillText(line, 20, y);
    y += lineHeight;
  }

  uiTexture.needsUpdate = true;
}

// COVID-Infos gleichzeitig in HTML-Box (Desktop) und 3D-Panel (XR) anzeigen
function showCovidInfo(data) {
  // HTML-Infobox
  infoBox.style.display = 'block';
  infoBox.innerHTML = `
    <div style="display:flex; align-items:center; margin-bottom:8px;">
      <img src="${data.countryInfo.flag}" alt="Flag of ${data.country}" style="width:40px; height:auto; margin-right:8px;">
      <h3 style="margin:0;">${data.country}</h3>
    </div>
    <p><strong>Population:</strong> ${data.population.toLocaleString()}</p>
    <p><strong>Cases:</strong> ${data.cases.toLocaleString()}</p>
    <p><strong>Deaths:</strong> ${data.deaths.toLocaleString()}</p>
    <p><strong>Recovered:</strong> ${data.recovered.toLocaleString()}</p>
    <p><strong>Active:</strong> ${data.active.toLocaleString()}</p>
    <p><strong>Critical:</strong> ${data.critical.toLocaleString()}</p>
  `;

  // 3D-Panel im Headset (mit Emoji-Flagge)
  drawUIPanel(data);
}

// Panel initial mit Standardtext
clearUIPanel();

// Button: COVID-Daten ein-/ausblenden (zeigt/verbirgt alle Poles)
const toggleCovid = document.getElementById('toggleCovid');
let covidVisible = true;

toggleCovid.addEventListener('click', () => {
  covidVisible = !covidVisible;
  allPoles.forEach(pole => {
    pole.visible = covidVisible;
  });
  toggleCovid.innerText = covidVisible ? 'Covid Data: ON' : 'Covid Data: OFF';
  if (!covidVisible) {
    infoBox.style.display = 'none';
    clearUIPanel();
  }
});

// Maus-Raycasting (nur Desktop, nicht im Headset)
window.addEventListener('mousemove', (event) => {
  if (renderer.xr.isPresenting) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects);

  interactiveObjects.forEach(pole => {
    pole.material.color.set(0x00ff00);
  });

  if (intersects.length > 0) {
    const intersectedPole = intersects[0].object;
    intersectedPole.material.color.set(0xff0000);

    const { isoCode } = intersectedPole.userData;
    fetchCovidData(isoCode).then(data => {
      showCovidInfo(data);
    });
  } else {
    infoBox.style.display = 'none';
    clearUIPanel();
  }
});

// =====================================================
//   XR CONTROLLER: LASER + INTERAKTION
// =====================================================

const controllerModelFactory = new XRControllerModelFactory();

const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
xrRig.add(controller1);
xrRig.add(controller2);

const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
xrRig.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
xrRig.add(controllerGrip2);

// Sichtbarer "Laser-Strahl" für beide Controller
function buildControllerVisual(controller) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  line.name = 'ray';
  line.scale.z = 10;
  controller.add(line);
}

buildControllerVisual(controller1);
buildControllerVisual(controller2);

const tempMatrix = new THREE.Matrix4();

// Variablen für Globus-Rotation beim "Grab"
let grabbedGlobe = false;
let activeController = null;
const initialControllerQuat = new THREE.Quaternion();
const initialGlobeQuat = new THREE.Quaternion();
const deltaQuat = new THREE.Quaternion();
const invInitialControllerQuat = new THREE.Quaternion();

// Raycast-Hilfsfunktion von einem Controller aus
function intersectFromController(controller, objects) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(objects, true);
}

// Trigger gedrückt
function onSelectStart(event) {
  const controller = event.target;

  // 1) Versuch: einen Pole treffen
  const poleHits = intersectFromController(controller, interactiveObjects);
  if (poleHits.length > 0) {
    const pole = poleHits[0].object;

    interactiveObjects.forEach(p => p.material.color.set(0x00ff00));
    pole.material.color.set(0xff0000);

    const { isoCode } = pole.userData;
    fetchCovidData(isoCode).then(data => {
      showCovidInfo(data);
    });
    return;
  }

  // 2) Wenn kein Pole getroffen -> Globus "greifen" (Rotation)
  const globeMeshes = [];
  if (globe.children.includes(daySphere)) globeMeshes.push(daySphere);
  if (globe.children.includes(nightSphere)) globeMeshes.push(nightSphere);

  const globeHits = intersectFromController(controller, globeMeshes);
  if (globeHits.length > 0) {
    grabbedGlobe = true;
    activeController = controller;
    initialControllerQuat.copy(controller.quaternion);
    initialGlobeQuat.copy(globe.quaternion);
  }
}

// Trigger losgelassen
function onSelectEnd() {
  grabbedGlobe = false;
  activeController = null;
}

// Zoom via Squeeze-Taste (optional, Globus näher/weiter)
let nearDistance = 4;
let farDistance = 10;
let isNear = false;

function onSqueezeStart() {
  const dir = globe.position.clone().normalize();
  isNear = !isNear;
  const d = isNear ? nearDistance : farDistance;
  globe.position.copy(dir.multiplyScalar(-d));
  controls.target.copy(globe.position);
}

// Events für beide Controller registrieren
controller1.addEventListener('selectstart', onSelectStart);
controller1.addEventListener('selectend', onSelectEnd);
controller1.addEventListener('squeezestart', onSqueezeStart);

controller2.addEventListener('selectstart', onSelectStart);
controller2.addEventListener('selectend', onSelectEnd);
controller2.addEventListener('squeezestart', onSqueezeStart);

// =====================================================
//   LOCOMOTION MIT LINKEM STICK (ANALOG)
//   -> Wir verschieben den Globus relativ zum Blick
// =====================================================

const moveSpeed = 0.03;

function handleXRGamepadMovement() {
  const session = renderer.xr.getSession();
  if (!session) return;

  const inputSources = session.inputSources;
  for (const source of inputSources) {
    if (!source.gamepad) continue;
    if (source.handedness !== 'left') continue; // nur linker Controller

    const axes = source.gamepad.axes;
    if (!axes || axes.length < 2) continue;

    const xAxis = axes[0]; // links/rechts
    const yAxis = axes[1]; // vor/zurück (negativ = nach vorn)

    // Deadzone -> kleine Bewegungen ignorieren
    if (Math.abs(xAxis) < 0.1 && Math.abs(yAxis) < 0.1) continue;

    // Blickrichtung der Kamera (auf XZ-Ebene projiziert)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    // Wir bewegen NICHT den Spieler, sondern den Globus in entgegengesetzter Richtung.
    // yAxis < 0 = "nach vorne laufen" -> Globus kommt näher
    globe.position.addScaledVector(forward, moveSpeed * yAxis);

    // xAxis = seitlich strafen -> Globus seitlich verschieben
    globe.position.addScaledVector(right, -moveSpeed * xAxis);
  }
}

// =====================================================
//   ANIMATION / ROTATION
// =====================================================

let rotationSpeed = 0.001;
let isPaused = false;

function animate() {
  // Globus automatisch rotieren (wenn nicht pausiert)
  if (!isPaused) {
    globe.rotation.y += rotationSpeed;
  }

  // Wenn Globus gegriffen -> Rotation folgt Controller-Orientierung
  if (grabbedGlobe && activeController) {
    deltaQuat.copy(activeController.quaternion);
    invInitialControllerQuat.copy(initialControllerQuat).invert();
    deltaQuat.multiply(invInitialControllerQuat);
    globe.quaternion.copy(deltaQuat.multiply(initialGlobeQuat));
  }

  // Locomotion per linkem Stick im XR-Modus
  handleXRGamepadMovement();

  // OrbitControls nur im 2D-/Desktop-Modus
  if (!renderer.xr.isPresenting) {
    controls.update();
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

// =====================================================
//   RESIZE-HANDLING
// =====================================================

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// =====================================================
//   UI: PAUSE + SPEED (Desktop-Overlay)
// =====================================================

const controlsDiv = document.createElement('div');
controlsDiv.style.position = 'absolute';
controlsDiv.style.top = '10px';
controlsDiv.style.left = '10px';
controlsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
controlsDiv.style.padding = '10px';
controlsDiv.style.borderRadius = '5px';
controlsDiv.style.color = 'white';
controlsDiv.style.zIndex = '999';
document.body.appendChild(controlsDiv);

const pausePlayButton = document.createElement('button');
pausePlayButton.innerText = 'Pause';
pausePlayButton.style.marginRight = '10px';
pausePlayButton.onclick = () => {
  isPaused = !isPaused;
  pausePlayButton.innerText = isPaused ? 'Play' : 'Pause';
  controls.autoRotate = !isPaused;
};
controlsDiv.appendChild(pausePlayButton);

const speedLabel = document.createElement('label');
speedLabel.innerText = 'Speed: ';
controlsDiv.appendChild(speedLabel);

const speedSlider = document.createElement('input');
speedSlider.type = 'range';
speedSlider.min = '0.001';
speedSlider.max = '0.01';
speedSlider.step = '0.003';
speedSlider.value = rotationSpeed;
speedSlider.oninput = (e) => {
  rotationSpeed = parseFloat(e.target.value);
};
controlsDiv.appendChild(speedSlider);
