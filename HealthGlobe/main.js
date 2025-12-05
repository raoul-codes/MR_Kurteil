import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { drawThreeGeo } from "./src/threeGeoJSON.js";
// WebXR Buttons für VR und AR
import { VRButton } from 'jsm/webxr/VRButton.js';
import { ARButton } from 'jsm/webxr/ARButton.js';
import { XRControllerModelFactory } from 'jsm/webxr/XRControllerModelFactory.js';

// =====================================================
//   SZENE, KAMERA, RENDERER
// =====================================================

const scene = new THREE.Scene();

// Kamera für Desktop-Ansicht
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 4, 10);
camera.lookAt(0, 0, 0);

// WebGL Renderer mit WebXR-Unterstützung
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true  // wichtig für AR (durchsichtiger Hintergrund)
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);

// WebXR aktivieren
renderer.xr.enabled = true;

// Canvas ins DOM einfügen
document.body.appendChild(renderer.domElement);

// Orbit Controls (nur für normalen Desktop-Modus genutzt)
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
  if (session && session.environmentBlendMode && session.environmentBlendMode !== 'opaque') {
    isARSession = true;
    oldBackground = scene.background;
    scene.background = null; // Realwelt sichtbar
  } else {
    isARSession = false;
  }
});

renderer.xr.addEventListener('sessionend', () => {
  if (isARSession) {
    scene.background = oldBackground;
    isARSession = false;
  }
});

// =====================================================
//   WEBXR-BUTTONS (VR + AR) SAUBER PLATZIEREN
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
arButton.style.bottom   = '70px';   // darüber
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

// Wireframe-Kugel für Länder-Umrisse
const geometry = new THREE.SphereGeometry(2.5, 64, 64);
const lineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  opacity: 0.5,
  transparent: true,
});
const edges = new THREE.EdgesGeometry(geometry);
const line = new THREE.LineSegments(edges, lineMat);

// Globus-Gruppe
const globe = new THREE.Group();

// Wichtig: Globus vor den XR-User setzen, damit man NICHT "drin" ist
globe.position.set(0, 0, -6);
scene.add(globe);

globe.add(dayAtmosphere);
globe.add(daySphere);

// OrbitControls um neue Position kreisen lassen
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
//   STERNE
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
//   GEOJSON + POLES (Covid-Visualisierung)
// =====================================================

const raycaster = new THREE.Raycaster();
raycaster.far = 50;
const mouse = new THREE.Vector2();
const interactiveObjects = [];  // alle poles
const allPoles = [];            // für Covid An/Aus

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y =  radius * Math.cos(phi);
  const z =  radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

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
//   COVID-API + INFOBOX (HTML, sichtbar in 2D)
// =====================================================

const covidCache = new Map();

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

const toggleCovid = document.getElementById('toggleCovid');
let covidVisible = true;

toggleCovid.addEventListener('click', () => {
  covidVisible = !covidVisible;
  allPoles.forEach(pole => {
    pole.visible = covidVisible;
  });
  toggleCovid.innerText = covidVisible ? 'Covid Data: ON' : 'Covid Data: OFF';
});

// Maus-Raycasting (nur Desktop)
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
    });
  } else {
    infoBox.style.display = 'none';
  }
});

// =====================================================
//   XR CONTROLLER: LASER + INTERAKTION
// =====================================================

const controllerModelFactory = new XRControllerModelFactory();

const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
scene.add(controller1);
scene.add(controller2);

const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
scene.add(controllerGrip2);

// Sichtbarer "Laser"-Strahl
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
let grabbedGlobe = false;
let activeController = null;
const grabOffset = new THREE.Vector3();

// Hilfsfunktion: Ray aus Controller in die Szene
function intersectFromController(controller, objects) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(objects, true);
}

function onSelectStart(event) {
  const controller = event.target;

  // 1) Versuchen, einen Pole zu treffen
  const poleHits = intersectFromController(controller, interactiveObjects);
  if (poleHits.length > 0) {
    const pole = poleHits[0].object;

    interactiveObjects.forEach(p => p.material.color.set(0x00ff00));
    pole.material.color.set(0xff0000);

    const { isoCode } = pole.userData;
    fetchCovidData(isoCode).then(data => {
      // In VR/AR sieht man die HTML-Infobox nicht im Headset,
      // aber in der Konsole oder auf dem Mirroring:
      console.log(`COVID ${data.country}: cases=${data.cases}, deaths=${data.deaths}`);
    });

    return;
  }

  // 2) Wenn kein Pole getroffen → versuchen, den Globus zu "greifen"
  const globeMeshes = [];
  if (globe.children.includes(daySphere)) globeMeshes.push(daySphere);
  if (globe.children.includes(nightSphere)) globeMeshes.push(nightSphere);

  const globeHits = intersectFromController(controller, globeMeshes);
  if (globeHits.length > 0) {
    grabbedGlobe = true;
    activeController = controller;

    const controllerPos = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    grabOffset.copy(globe.position).sub(controllerPos);
  }
}

function onSelectEnd() {
  grabbedGlobe = false;
  activeController = null;
}

// Zoom via Squeeze: Globus näher/weiter
let nearDistance = 4;
let farDistance = 10;
let isNear = false;

function onSqueezeStart() {
  const dir = globe.position.clone().normalize();
  isNear = !isNear;
  const d = isNear ? nearDistance : farDistance;
  globe.position.copy(dir.multiplyScalar(-d)); // -d weil dir ~ (0,0,-1)
  controls.target.copy(globe.position);
}

// Events an Controller binden
controller1.addEventListener('selectstart', onSelectStart);
controller1.addEventListener('selectend', onSelectEnd);
controller1.addEventListener('squeezestart', onSqueezeStart);

controller2.addEventListener('selectstart', onSelectStart);
controller2.addEventListener('selectend', onSelectEnd);
controller2.addEventListener('squeezestart', onSqueezeStart);

// =====================================================
//   ANIMATION / ROTATION
// =====================================================

let rotationSpeed = 0.001;
let isPaused = false;

function animate() {
  if (!isPaused) {
    globe.rotation.y += rotationSpeed;
  }

  // Wenn Globus "gegriffen" ist, folgt er dem Controller
  if (grabbedGlobe && activeController) {
    const controllerPos = new THREE.Vector3().setFromMatrixPosition(activeController.matrixWorld);
    globe.position.copy(controllerPos).add(grabOffset);
  }

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
//   UI: PAUSE + SPEED
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
