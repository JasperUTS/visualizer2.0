import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GUI } from 'dat.gui';
import { kaleidoscopeVertexShader, kaleidoscopeFragmentShader } from './shaders/kaleidoscopeShader';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.z = 2;
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Create plane for kaleidoscope
const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
    vertexShader: kaleidoscopeVertexShader,
    fragmentShader: kaleidoscopeFragmentShader,
    uniforms: {
        time: { value: 0 },
        segments: { value: 8.0 },
        speed: { value: 1.0 },
        zoom: { value: 5.0 },
        color1: { value: new THREE.Color(0xff00ff) },
        color2: { value: new THREE.Color(0x00ffff) },
        patternIntensity: { value: 0.8 }
    }
});

const kaleidoscope = new THREE.Mesh(geometry, material);
scene.add(kaleidoscope);

// GUI
const gui = new GUI();

// Kaleidoscope controls
const kaleidoscopeFolder = gui.addFolder('Kaleidoscope Settings');
kaleidoscopeFolder.add(material.uniforms.segments, 'value', 3, 20).name('Segments').step(1);
kaleidoscopeFolder.add(material.uniforms.speed, 'value', 0, 5).name('Speed');
kaleidoscopeFolder.add(material.uniforms.zoom, 'value', 1, 20).name('Zoom');
kaleidoscopeFolder.addColor(material.uniforms.color1, 'value').name('Color 1');
kaleidoscopeFolder.addColor(material.uniforms.color2, 'value').name('Color 2');
kaleidoscopeFolder.add(material.uniforms.patternIntensity, 'value', 0, 1).name('Pattern Intensity');
kaleidoscopeFolder.open();

// Animation
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();

    // Update shader uniforms
    material.uniforms.time.value = elapsedTime;

    controls.update();
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate(); 