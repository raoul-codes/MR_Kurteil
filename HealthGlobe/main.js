import * as THREE from "three";
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { drawThreeGeo, container } from "./src/threeGeoJSON.js";
import { CSS2DRenderer, CSS2DObject } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/renderers/CSS2DRenderer.js';
// WebXR Buttons für VR und AR
import { VRButton } from 'jsm/webxr/VRButton.js';
import { ARButton } from 'jsm/webxr/ARButton.js';


// Scene, Camera, Renderer
const scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 2000);
//camera.position.z = 10;
camera.position.set(20, 0.5, 15).setLength(20);

// WebGL Renderer mit WebXR-Unterstützung
let renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true // wichtig für AR (durchsichtiger Hintergrund)
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);

// WebXR aktivieren
renderer.xr.enabled = true;

//  Szene-Hintergrund für AR anpassen
let oldBackground = scene.background;

renderer.xr.addEventListener('sessionstart', () => {
  const session = renderer.xr.getSession();
  // Wenn AR-Session: Hintergrund ausblenden
  if (session && session.environmentBlendMode && session.environmentBlendMode !== 'opaque') {
    oldBackground = scene.background;
    scene.background = null;
  }
});

renderer.xr.addEventListener('sessionend', () => {
  // Alten Hintergrund wiederherstellen (z.B. Sternen-Himmel)
  scene.background = oldBackground;
});


document.body.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 11;
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed *= 0.25;

// VR-Button (für immersive-vr)
const vrButton = VRButton.createButton(renderer);
// Position im UI anpassen
vrButton.style.position = 'absolute';
vrButton.style.bottom = '20px';
vrButton.style.left = '20px';
document.body.appendChild(vrButton);

// AR-Button (für immersive-ar, z. B. Meta Quest 3)
const arButton = ARButton.createButton(renderer, {
  requiredFeatures: [],             // z.B. ['hit-test'] wenn du Hit-Tests brauchst
  optionalFeatures: ['local-floor'] // für angenehme AR-Höhe
});
arButton.style.position = 'absolute';
arButton.style.bottom = '20px';
arButton.style.left = '140px';
document.body.appendChild(arButton);

// Vertex Shader for Earth
const vertexShader = `
    varying vec2 vertexUV;
    varying vec3 vertexNormal;

    void main() {
      vertexUV = uv;
      vertexNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix
        * vec4(position, 1.0);
    }
`;

// Fragment Shader for Earth
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


// Vertex Shader for Atmosphere
const vertexShaderAtmosphere = `
    varying vec3 vertexNormal;

    void main() {
      vertexNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix
        * vec4(position, 1.0);
    }
`;

// Fragment Shader for Day Atmospshere
const fragmentDayShaderAtmosphere = `
    varying vec3 vertexNormal;

    void main() {
        float intensity = pow(0.55 - dot(vertexNormal, vec3(0.0, 0.0, 1.0)), 2.0);

        gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
    }
`;
// Fragment Shader for Night Atmospshere
const fragmentNightShaderAtmosphere = `
    varying vec3 vertexNormal;

    void main() {
        float intensity = pow(0.4 - dot(vertexNormal, vec3(0.0, 0.0, 1.0)), 2.0);

        gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0) * intensity;
    }
`;




////----------Creating an day earth globe using custom shaders-----------/////
const daySphere = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 50, 50),
  new THREE.ShaderMaterial({
    //Loads Texture on Sphere
    vertexShader,
    fragmentShader,
    uniforms: {
      globeTexture: {
        value: new THREE.TextureLoader().load("./src/globe.jpg")
      }
    }
  })
)

////----------Creating an night earth globe using custom shaders-----------/////
const nightSphere = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 50, 50),
  new THREE.ShaderMaterial({
    //Loads Texture on Sphere
    vertexShader,
    fragmentShader,
    uniforms: {
      globeTexture: {
        value: new THREE.TextureLoader().load("//unpkg.com/three-globe/example/img/earth-night.jpg")
      }
    }
  })
)

////----------Creating an day atmosphere using custom shaders-----------/////
const dayAtmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(3.0, 50, 50),
  new THREE.ShaderMaterial({
    //Loads Texture on Sphere
    vertexShader: vertexShaderAtmosphere,
    fragmentShader: fragmentDayShaderAtmosphere,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,

  })
)

////----------Creating an night atmosphere using custom shaders-----------/////
const nightAtmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 50, 50),
  new THREE.ShaderMaterial({
    //Loads Texture on Sphere
    vertexShader: vertexShaderAtmosphere,
    fragmentShader: fragmentNightShaderAtmosphere,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
  })
)


// Globe Geometry
const geometry = new THREE.SphereGeometry(2.5, 64, 64);
const lineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  opacity: 0.5,
  transparent: true,
});
const edges = new THREE.EdgesGeometry(geometry);
const line = new THREE.LineSegments(edges, lineMat);

// Group for rotating globe
const globe = new THREE.Group();
//globe.add(line);
scene.add(globe);
globe.add(dayAtmosphere)
globe.add(daySphere);


// Background: Space Texture
const loader = new THREE.TextureLoader();
// const dayTexture1 = loader.load('./src/space1.png'); // Texture pour le mode clair
// const nightTexture = loader.load("//unpkg.com/three-globe/example/img/earth-night.jpg"); // Texture pour le mode nuit
const texture1 = loader.load(
  'https://cdn.glitch.com/0f2dd307-0d28-4fe9-9ef9-db84277033dd%2Fhdr3.png?v=1620582677695',
  () => {
    const rt = new THREE.WebGLCubeRenderTarget(texture1.image.height);
    texture1.colorSpace = THREE.SRGBColorSpace;
    rt.fromEquirectangularTexture(renderer, texture1);
    scene.background = rt.texture;
  });



// Mode Button
const toggleButton = document.getElementById('toggleMode');
let isNightMode = false; // default mode day mode

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
  isNightMode = !isNightMode; // change Mode
});


// Adding Stars
function addStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.02,
    transparent: true,
    opacity: 0.8,
  });

  const starCount = 2000;
  const starPositions = new Float32Array(starCount * 3); // 3 coordinates per star (x, y, z)

  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 50; // x
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 50; // y
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 50; // z
  }

  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}
addStars();

// Raycaster and mouse for interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const interactiveObjects = [];  // Store piquets for interaction

// Function to convert lat/lon to 3D position
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180); // Convert latitude to polar angle
  const theta = (lon + 180) * (Math.PI / 180); // Convert longitude to azimuthal angle

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

// Function to add a green pole at a given position
function addPole(lat, lon, radius, countryCode) {
  const poleHeight = 0.6; // Length of the pole
  const poleRadius = 0.02; // Thickness of the pole

  const start = latLonToVector3(lat, lon, radius); // Start position on the surface
  const end = latLonToVector3(lat, lon, radius + poleHeight); // End position above the surface

  const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 8);
  const poleMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00,   // Green color
    transparent: true, // Enable transparency
    opacity: 0.5 
  }); // Green color

  const pole = new THREE.Mesh(poleGeometry, poleMaterial);

  // Position the pole at the midpoint between start and end
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  pole.position.copy(midpoint);

  // Align the pole with the vector pointing out of the globe
  pole.lookAt(end);
  pole.rotateX(Math.PI / 2); // Rotate to align with the globe's surface normal

  // Add userData for interaction
  pole.userData = { isoCode: countryCode };
  interactiveObjects.push(pole);
  globe.add(pole);

  const toggleCovid= document.getElementById('toggleCovid');
  let covidData = true; 

  toggleCovid.addEventListener('click', () => {
    if (covidData) {
      globe.add(pole);
      toggleCovid.innerText = 'Covid Data : ON';
    } else {
      globe.remove(pole);
      toggleCovid.innerText = 'Covid Data: OFF';
    }
    covidData = !covidData; // change Mode
  });
}
// Fetch GeoJSON Data
fetch('./geojson/countries.json')
  .then(response => response.text())
  .then(text => {
    const data = JSON.parse(text);

    // Draw the GeoJSON countries on the globe
    const countries = drawThreeGeo({
      json: data,
      radius: 2.5,
      materialOptions: {
        color: 0xffffff,
      },
    });
    const toggleWireframeButton= document.getElementById('toggleWireframe');
    let isWireframe = false; // default mode day mode

    toggleWireframeButton.addEventListener('click', () => {
    
      if (isWireframe) {
        if(isNightMode){
          globe.remove(nightSphere);
          globe.remove(nightAtmosphere);
        } else {
        globe.remove(daySphere);
        globe.remove(dayAtmosphere);
        }
        globe.add(line);
        globe.add(countries);
        toggleWireframeButton.innerText = 'Wireframe : ON';
      } else {
        if(isNightMode){
          globe.add(nightSphere);
          globe.add(nightAtmosphere);
        } else {
        globe.add(daySphere);
        globe.add(dayAtmosphere);
        }
        globe.remove(line);
        globe.remove(countries);
        toggleWireframeButton.innerText = 'Wireframe : OFF';
      }
      isWireframe = !isWireframe; // change Mode
    });

   // Loop through the GeoJSON features and add poles
    data.features.forEach(feature => {
      const { iso_a3 } = feature.properties;

      // Calculate centroid for each country
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

// Fetch COVID-19 data for a specific country
function fetchCovidData(isoCode) {
  return fetch(`https://disease.sh/v3/covid-19/countries/${isoCode}`)
    .then(response => response.json())
    .catch(error => console.error(`Error fetching data for ${isoCode}:`, error));
}

// Display COVID data in an info box
const infoBox = document.createElement('div');
infoBox.style.position = 'absolute';
infoBox.style.top = '10px';
infoBox.style.right = '10px';
infoBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
infoBox.style.color = 'white';
infoBox.style.padding = '10px';
infoBox.style.borderRadius = '5px';
infoBox.style.display = 'none';
document.body.appendChild(infoBox);

// Mouse move handler for raycasting
window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects);

  interactiveObjects.forEach(pole => {
    pole.material.color.set(0x00ff00); // Reset color to green
  });

  if (intersects.length > 0) {
    const intersectedPole = intersects[0].object;
    intersectedPole.material.color.set(0xff0000); // Highlight pole in red

    // Fetch and display COVID data
    const { isoCode } = intersectedPole.userData;
    fetchCovidData(isoCode).then(data => {
      infoBox.style.display = 'block';
      infoBox.innerHTML = `
        <div>
          <img src="${data.countryInfo.flag}" alt="Flag of ${data.country}">
          <h3>${data.country}</h3>
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

// Rotation and Animation Variables
let rotationSpeed = 0.001; // Default rotation speed
let isPaused = false; // Rotation paused or not

//Animation Loop
function animate() {
 // Erde rotieren (wenn nicht pausiert)
 if (!isPaused) {
  globe.rotation.y += rotationSpeed;
}

// Sterne leicht rotieren für dynamischen Hintergrund
scene.children.forEach((child) => {
  if (child.isPoints) {
    child.rotation.y += 0.001;
  }
});

// OrbitControls nur im "normalen" Modus verwenden
if (!renderer.xr.isPresenting) {
  controls.update();
}

renderer.render(scene, camera);
}

// Anstatt requestAnimationFrame → WebXR-kompatibel:
renderer.setAnimationLoop(animate);


// Handle Window Resize
function handleWindowResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', handleWindowResize, false);

// UI: Pause/Play and Speed Controls
const controlsDiv = document.createElement('div');
controlsDiv.style.position = 'absolute';
controlsDiv.style.top = '10px';
controlsDiv.style.left = '10px';
controlsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
controlsDiv.style.padding = '10px';
controlsDiv.style.borderRadius = '5px';
controlsDiv.style.color = 'white';
document.body.appendChild(controlsDiv);

// Pause/Play Button
 const pausePlayButton = document.createElement('button');
 pausePlayButton.innerText = 'Pause';
 pausePlayButton.style.marginRight = '10px';
 pausePlayButton.onclick = () => {
   isPaused = !isPaused;
   pausePlayButton.innerText = isPaused ? 'Play' : 'Pause';
   controls.autoRotate = !isPaused;
 };
 controlsDiv.appendChild(pausePlayButton);

// Speed Slider
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
