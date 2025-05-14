/**
 * Audio Visualizer Class
 * 
 * This class creates an interactive 3D audio visualizer using Three.js.
 * It supports multiple visualization styles and responds to audio input.
 */
class Visualizer {
    /**
     * Initialize the visualizer with default settings and properties
     */
    constructor() {
        // Three.js scene setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.originalCamera = null; // Store original camera when using shader visualizer
        
        // Audio processing properties
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = new Uint8Array(128);
        
        // Visualizer elements
        this.bars = [];
        this.particles = [];
        this.towers = [];
        this.groundPlane = null;
        this.cloudLayers = [];
        
        // State management
        this.isPlaying = false;
        this.currentStyle = 'bars';
        this.audioFiles = [];
        this.currentTrackIndex = 0;
        this.currentTime = 0;
        this.updateInterval = null;
        
        // Controls and timing
        this.orbitControls = null;
        this.clock = new THREE.Clock();
        
        // Shader visualizer properties
        this.shaderPlane = null;
        this.shaderMaterial = null;
        this.shaderTime = 0;
        this.audioDataArray = null;
        this.lowFreqSmoothed = 0;
        this.midFreqSmoothed = 0;
        this.highFreqSmoothed = 0;
        this.overallSmoothed = 0;
        
        // Initialize the visualizer
        this.init();
        this.setupControls();
        this.createVisualizer();
        this.animate();
    }

    /**
     * Initialize the Three.js scene, camera, renderer, and lights
     */
    init() {
        // Set up renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Set up camera
        this.camera.position.z = 15;
        this.camera.lookAt(0, 0, 0);

        // Set up lights
        const ambientLight = new THREE.AmbientLight(0xcccccc, 0.3);
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.sunLight.position.set(-100, 50, 100);
        this.scene.add(this.sunLight);

        // Set up orbit controls
        this.orbitControls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.screenSpacePanning = false;
        this.orbitControls.minDistance = 5;
        this.orbitControls.maxDistance = 100;
        this.orbitControls.maxPolarAngle = Math.PI / 2;
        this.orbitControls.enabled = false;

        // Set default paper color
        this.paperColor = new THREE.Color(0xF5E8C8);

        // Set up window resize handler
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Create initial visualizer
        this.createVisualizer();
    }

    /**
     * Set up event listeners for controls (play/pause, next/prev, file upload)
     */
    setupControls() {
        const audioInput = document.getElementById('audio-input');
        const playPauseBtn = document.getElementById('play-pause');
        const nextBtn = document.getElementById('next');
        const prevBtn = document.getElementById('prev');
        const visualizerStyle = document.getElementById('visualizer-style');

        // Initialize audio context on first user interaction
        const initAudioContext = () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                this.setupAudio();
            }
        };

        // Handle file selection
        audioInput.addEventListener('change', (event) => {
            initAudioContext();
            const files = event.target.files;
            const fileArray = Array.from(files);
            
            // Limit to max 5 tracks
            if (fileArray.length > 5) {
                alert('Maximum 5 tracks allowed. Only the first 5 will be loaded.');
                this.audioFiles = fileArray.slice(0, 5);
            } else {
                this.audioFiles = fileArray;
            }
            
            if (this.audioFiles.length > 0) {
                this.currentTrackIndex = 0;
                this.loadAudioFile(this.audioFiles[0]);
                this.updateTrackList();
            }
        });

        // Handle play/pause
        playPauseBtn.addEventListener('click', () => {
            initAudioContext();
            const playIcon = document.getElementById('play-icon');

            if (!this.audioContext || !this.audioBuffer) return;

            if (this.isPlaying) {
                this.source.stop();
                this.isPlaying = false;
                if (playIcon) playIcon.textContent = 'play_arrow';
                if (this.updateInterval) clearInterval(this.updateInterval);
            } else {
                this.source = this.audioContext.createBufferSource(); // Create a NEW source
                this.source.buffer = this.audioBuffer;
                this.source.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);

                this.source.start(0);
                this.startTime = this.audioContext.currentTime;
                this.isPlaying = true;

                if (playIcon) playIcon.textContent = 'pause';

                this.updateInterval = setInterval(() => this.updateProgress(), 100);
            }
        });

        // Handle next/previous
        nextBtn.addEventListener('click', () => this.playNextTrack());
        prevBtn.addEventListener('click', () => this.playPreviousTrack());
        visualizerStyle.addEventListener('change', (event) => {
            this.currentStyle = event.target.value;
            this.createVisualizer();
        });

        // Handle visualizer style change
        visualizerStyle.addEventListener('change', (event) => {
            this.currentStyle = event.target.value;
            this.createVisualizer();
        });
    }

    /**
     * Set up audio analyzer with appropriate settings
     */
    setupAudio() {
        if (!this.analyser) return;
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.8;
    }

    /**
     * Format time in seconds to MM:SS format
     */
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Update the progress bar and time display
     */
    updateProgress() {
        if (this.source && this.audioBuffer) {
            this.currentTime = this.audioContext.currentTime - this.startTime;
            const progress = (this.currentTime / this.audioBuffer.duration) * 100;
            document.querySelector('.progress').style.width = `${progress}%`;
            document.getElementById('current-time').textContent = this.formatTime(this.currentTime);
            
            if (this.currentTime >= this.audioBuffer.duration) {
                this.playNextTrack();
            }
        }
    }

    /**
     * Load and decode an audio file
     */
    loadAudioFile(file) {
        if (!this.audioContext) return;
        
        // Store whether we were playing before loading the new track
        const wasPlaying = this.isPlaying;
        
        // Stop current track if it's playing
        if (this.isPlaying && this.source) {
            this.source.stop();
            this.isPlaying = false;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            this.audioContext.decodeAudioData(event.target.result, (buffer) => {
                this.audioBuffer = buffer;
                this.source = this.audioContext.createBufferSource();
                this.source.buffer = this.audioBuffer;
                this.source.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
                
                // Reset UI elements
                const playIcon = document.getElementById('play-icon');
                if (playIcon) playIcon.textContent = wasPlaying ? 'pause' : 'play_arrow';
                document.getElementById('total-time').textContent = this.formatTime(buffer.duration);
                this.currentTime = 0;
                document.querySelector('.progress').style.width = '0%';
                document.getElementById('current-time').textContent = '0:00';
                
                // Update track name display
                this.updateTrackNameDisplay(file.name);
                
                // If we were playing before, automatically start the new track
                if (wasPlaying) {
                    this.source.start(0);
                    this.startTime = this.audioContext.currentTime;
                    this.isPlaying = true;
                    
                    // Start the progress update interval
                    if (this.updateInterval) clearInterval(this.updateInterval);
                    this.updateInterval = setInterval(() => this.updateProgress(), 100);
                }
            });
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Update the track name display
     */
    updateTrackNameDisplay(filename) {
        const trackNameDisplay = document.getElementById('track-name-display');
        if (trackNameDisplay) {
            // Clean up the filename - remove extension and replace underscores/hyphens with spaces
            let displayName = filename.replace(/\.[^/.]+$/, ""); // Remove file extension
            displayName = displayName.replace(/[_-]/g, " "); // Replace underscores and hyphens with spaces
            
            // Capitalize first letter of each word
            displayName = displayName.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
                
            trackNameDisplay.textContent = displayName;
        }
    }

    /**
     * Play the next track in the playlist
     */
    playNextTrack() {
        if (this.audioFiles.length > 0) {
            this.currentTrackIndex = (this.currentTrackIndex + 1) % this.audioFiles.length;
            const nextTrack = this.audioFiles[this.currentTrackIndex];
            this.loadAudioFile(nextTrack);
            this.updateTrackList();
        }
    }

    /**
     * Play the previous track in the playlist
     */
    playPreviousTrack() {
        if (this.audioFiles.length > 0) {
            this.currentTrackIndex = (this.currentTrackIndex - 1 + this.audioFiles.length) % this.audioFiles.length;
            const prevTrack = this.audioFiles[this.currentTrackIndex];
            this.loadAudioFile(prevTrack);
            this.updateTrackList();
        }
    }
     
    formatTime(seconds){
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    updateProgress(){
        if (this.audioContext && this.audioBuffer && this.isPlaying) {
            this.currentTime = this.audioContext.currentTime - this.startTime;
            const progress = (this.currentTime / this.audioBuffer.duration) * 100;
            document.querySelector('.progress').style.width = `${progress}%`;
            document.getElementById('current-time').textContent = this.formatTime(this.currentTime);
            if (this.currentTime >= this.audioBuffer.duration) {
                this.playNextTrack();
            }
        }
    }
    

    /**
     * Create the current visualizer based on the selected style
     */
    createVisualizer() {
        // Store the previous style before clearing the scene
        const previousStyle = this.currentStyle;
        
        console.log(`Switching visualizer from "${previousStyle}" to "${this.currentStyle}"`);
        console.log(`Camera before switch:`, {
            position: { ...this.camera.position },
            isOrthographic: this.camera instanceof THREE.OrthographicCamera,
            isPerspective: this.camera instanceof THREE.PerspectiveCamera,
            fov: this.camera.fov,
            aspect: this.camera.aspect
        });
        
        this.clearScene();
        
        // Restore camera if switching FROM shaders visualizer - FIXED APPROACH
        if (previousStyle === 'shaders') {
            console.log(`Restoring camera from shaders mode - creating NEW camera`);
            
            // Dispose of old camera
            if (this.camera.dispose) {
                this.camera.dispose();
            }
            
            // Create a completely fresh perspective camera
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            
            // Reset orbit controls to use new camera
            this.orbitControls.object = this.camera;
            
            // Clear any stored original camera
            this.originalCamera = null;
            
            console.log(`Created NEW perspective camera:`, {
                isPerspective: this.camera instanceof THREE.PerspectiveCamera,
                fov: this.camera.fov
            });
        }
        
        // Set up basic scene
        this.camera.position.set(0, 10, 20);
        this.camera.lookAt(0, 0, 0);
        this.scene.background = new THREE.Color(0x000005);
        this.orbitControls.enabled = false;
        this.orbitControls.target.set(0, 0, 0);

        // Create visualizer based on current style
        switch(this.currentStyle) {
            case 'bars':
                this.createBars();
                break;
            case 'points':
                this.createPointsVisualizer();
                break;
            case 'towers':
                this.createTowersVisualizer();
                // Set camera to low flying car position
                this.camera.position.set(0, 2, 10);
                this.camera.lookAt(0, 1, 0);
                break;
            case 'shaders':
                console.log(`Saving original camera before creating shader visualizer`, {
                    position: { ...this.camera.position },
                    isPerspective: this.camera instanceof THREE.PerspectiveCamera
                });
                this.createShadersVisualizer();
                break;
        }

        console.log(`Camera after switch to "${this.currentStyle}":`, {
            position: { ...this.camera.position },
            isOrthographic: this.camera instanceof THREE.OrthographicCamera,
            isPerspective: this.camera instanceof THREE.PerspectiveCamera,
            hasOriginalCamera: this.originalCamera !== null
        });
        
        // Ensure initial render
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Clean up the current visualizer before creating a new one
     */
    clearScene() {
        // Remove all visualizer elements
        this.bars.forEach(bar => this.scene.remove(bar));
        this.particles.forEach(particle => this.scene.remove(particle));
        this.towers.forEach(tower => this.scene.remove(tower));
        
        if (this.groundPlane) {
            this.scene.remove(this.groundPlane);
            this.groundPlane = null;
        }
        
        // Remove cloud layers
        this.cloudLayers.forEach(layer => this.scene.remove(layer));
        this.cloudLayers = [];
        
        // Remove starfield
        if (this.starfield) {
            this.scene.remove(this.starfield);
            this.starfield.geometry.dispose();
            this.starfield.material.dispose();
            this.starfield = null;
        }

        // Reset arrays
        this.bars = [];
        this.particles = [];
        this.towers = [];

        // Reset background
        this.scene.background = new THREE.Color(0x000005);
        
        // Clean up points visualizer elements
        if (this.pointsMesh) {
            this.scene.remove(this.pointsMesh);
            this.pointsMesh.geometry.dispose();
            this.pointsMesh.material.dispose();
            this.pointsMesh = null;
        }
        
        // Clean up shader visualizer elements
        if (this.shaderPlane) {
            this.scene.remove(this.shaderPlane);
            this.shaderPlane.geometry.dispose();
            this.shaderPlane.material.dispose();
            this.shaderPlane = null;
        }
        if (this.shaderMaterial) {
            this.shaderMaterial.dispose();
            this.shaderMaterial = null;
        }
        
        // Note: Camera restoration is now handled in createVisualizer
        // so we don't restore the camera here
        
        // Reset shader-related properties
        this.shaderTime = 0;
        this.lowFreqSmoothed = 0;
        this.midFreqSmoothed = 0;
        this.highFreqSmoothed = 0;
        this.overallSmoothed = 0;
    }

    /**
     * Create the bars visualizer
     * Creates a set of vertical bars that react to audio frequencies
     */
    createBars() {
        const barCount = 64;
        const barWidth = 0.2;
        const barHeight = 1;
        const spacing = 0.3;
        const totalWidth = (barCount - 1) * (barWidth + spacing);
        const startX = -totalWidth / 2;

        // Create bars with initial properties
        for (let i = 0; i < barCount; i++) {
            const geometry = new THREE.BoxGeometry(barWidth, barHeight, 1);
            const material = new THREE.MeshPhongMaterial({
                color: 0x00ff00,
                shininess: 100
            });
            const bar = new THREE.Mesh(geometry, material);
            bar.position.x = startX + i * (barWidth + spacing);
            bar.position.y = 0;
            this.scene.add(bar);
            this.bars.push(bar);
        }
    }

    /**
     * Create the points visualizer
     * Creates a particle system that forms atmospheric patterns
     */
    createPointsVisualizer() {
        // Set a dark background
        this.scene.background = new THREE.Color(0x000011);
        
        // Create a large number of points
        const pointCount = 15000;
        const positions = new Float32Array(pointCount * 3);
        const colors = new Float32Array(pointCount * 3);
        const sizes = new Float32Array(pointCount);

        // Initialize points with random positions and colors
        const color = new THREE.Color();
        for (let i = 0; i < pointCount; i++) {
            const i3 = i * 3;
            
            // Random positions in a sphere
            const radius = 50;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
            
            // Random colors
            color.setHSL(Math.random(), 0.8, 0.5);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            // Random sizes
            sizes[i] = Math.random() * 2;
        }

        // Create geometry with point attributes
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Create shader material for points
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                audioLevel: { value: 0 },
                pointTexture: { value: new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png') }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;
                uniform float time;
                uniform float audioLevel;
                
                void main() {
                    vColor = color;
                    
                    // Get vertex position
                    vec3 pos = position;
                    
                    // Add some movement based on audio
                    float movement = sin(time + pos.x * 0.1) * cos(time + pos.y * 0.1) * audioLevel * 2.0;
                    pos += pos * movement * 0.1;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z) * (1.0 + audioLevel);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying vec3 vColor;
                
                void main() {
                    vec2 center = vec2(0.5, 0.5);
                    float dist = length(gl_PointCoord - center);
                    
                    // Create soft, glowing points
                    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                    
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // Create points mesh
        this.pointsMesh = new THREE.Points(geometry, material);
        this.scene.add(this.pointsMesh);

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        // Set initial camera position
        this.camera.position.set(0, 0, 100);
        this.camera.lookAt(0, 0, 0);
    }

    /**
     * Create the wave visualizer
     * Creates a particle system that emits particles from the center in sync with audio beats
     * Inspired by Hajime Watanabe's exhibition aesthetics
     */
    createWaveVisualizer() {
        // Set a dark background
        this.scene.background = new THREE.Color(0x000011);
        
        // Initialize particles and systems
        this.waveParticles = [];
        this.particleSystem = null;
        this.particleCount = 0;
        this.maxParticles = 3000;
        this.emissionRate = 30; // Particles per beat
        this.particleLifespan = 3.0; // Seconds
        
        // Exhibition space elements
        this.exhibitionFrames = [];
        this.exhibitionFloor = null;
        this.exhibitionWalls = [];
        
        // Create exhibition space
        this.createExhibitionSpace();
        
        // Create particle geometry
        const geometry = new THREE.BufferGeometry();
        
        // Pre-allocate arrays for particle system
        const positions = new Float32Array(this.maxParticles * 3);
        const colors = new Float32Array(this.maxParticles * 3);
        const sizes = new Float32Array(this.maxParticles);
        const lifetimes = new Float32Array(this.maxParticles);
        
        // Initialize particles (invisible until emitted)
        for (let i = 0; i < this.maxParticles; i++) {
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
            sizes[i] = 0;
            lifetimes[i] = -1;
        }
        
        // Create attributes for particle system
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Store lifetime data for animation
        this.particleLifetimes = lifetimes;
        
        // Create shader material for particles
        this.waveMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                pointTexture: { value: new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png') }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (100.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying vec3 vColor;
                
                void main() {
                    // Create soft, glowing particles
                    vec2 uv = gl_PointCoord;
                    float dist = length(uv - vec2(0.5));
                    
                    // Square-ish particles with soft edges (Watanabe style)
                    float alpha = smoothstep(0.5, 0.3, dist);
                    
                    // Apply texture and color
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        // Create the particle system
        this.particleSystem = new THREE.Points(geometry, this.waveMaterial);
        this.scene.add(this.particleSystem);
        
        // Add ambient lighting
        const ambientLight = new THREE.AmbientLight(0x111122, 0.8);
        this.scene.add(ambientLight);
        
        // Add directional lighting for exhibition space
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(0, 30, 20);
        this.scene.add(directionalLight);
        
        // Initialize beat detection variables
        this.beatDetectionVars = {
            energyHistory: new Array(30).fill(0),
            beatThreshold: 1.5,
            lastBeatTime: 0,
            beatHoldTime: 0.2,
            bassEnergy: 0,
            trebleEnergy: 0,
            bassBeat: 0,
            trebleBeat: 0,
            emitCooldown: 0
        };
        
        // Set camera position for exhibition view
        this.camera.position.set(0, 40, 130);
        this.camera.lookAt(0, 10, 0);
    }
    
    /**
     * Create exhibition space for particles
     * Inspired by Watanabe's minimalist aesthetics
     */
    createExhibitionSpace() {
        // Create floor
        const floorGeometry = new THREE.PlaneGeometry(200, 200);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x111122,
            metalness: 0.2,
            roughness: 0.8,
            side: THREE.DoubleSide
        });
        this.exhibitionFloor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.exhibitionFloor.rotation.x = Math.PI / 2;
        this.exhibitionFloor.position.y = -10;
        this.scene.add(this.exhibitionFloor);
        
        // Create walls
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x111122,
            metalness: 0.1,
            roughness: 0.9,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4
        });
        
        // Back wall
        const backWallGeometry = new THREE.PlaneGeometry(200, 50);
        const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
        backWall.position.set(0, 15, -100);
        this.scene.add(backWall);
        this.exhibitionWalls.push(backWall);
        
        // Create frames for particle containment
        this.createExhibitionFrames();
    }
    
    /**
     * Create frames inspired by Watanabe's exhibition designs
     */
    createExhibitionFrames() {
        const frameCount = 3;
        const frameSpacing = 30;
        
        for (let i = 0; i < frameCount; i++) {
            // Create a frame that will affect particle movement
            const frameGeometry = new THREE.BoxGeometry(80 - i * 15, 40 - i * 7, 2);
            const frameMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 0.8,
                roughness: 0.2,
                transparent: true,
                opacity: 0.1 + (i * 0.05)
            });
            
            const frame = new THREE.Mesh(frameGeometry, frameMaterial);
            frame.position.z = -50 + (i * frameSpacing);
            frame.position.y = 15;
            
            this.scene.add(frame);
            this.exhibitionFrames.push(frame);
        }
    }

    /**
     * Create the towers visualizer
     * Creates a grid of towers that react to audio with height and color changes
     */
    createTowersVisualizer() {
        this.towers = [];
        this.cloudLayers = []; 

        // Set up scene properties
        this.scene.fog = null;
        this.scene.background = new THREE.Color(0x000000);

        // Configure grid settings
        const planeSize = 150;
        const viewDistance = 75;
        this.towerGridSettings = {
            gridSize: 20,
            spacing: planeSize / 20, 
            towerBaseSize: 2.0, 
            baseTowerHeight: 0.1,
            planeSize: planeSize,
            wrapDistanceZ: viewDistance
        };
        const gs = this.towerGridSettings;

        // Create ground plane
        const planeGeometry = new THREE.PlaneGeometry(gs.planeSize * 2, gs.planeSize * 2);
        const planeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x050508, 
            metalness: 0.3,
            roughness: 0.7,
            emissive: 0x000000,
            emissiveIntensity: 0
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -gs.baseTowerHeight / 2; 
        this.scene.add(plane);
        this.groundPlane = plane; 

        // Create stars
        this.createStarfield();

        // Create towers in a grid
        for (let x = 0; x < gs.gridSize; x++) {
            for (let z = 0; z < gs.gridSize * 2; z++) {
                const geometry = new THREE.BoxGeometry(gs.towerBaseSize, gs.baseTowerHeight, gs.towerBaseSize);
                const material = new THREE.MeshStandardMaterial({ 
                    color: 0xffffff, 
                    metalness: 0.1,
                    roughness: 0.6,
                    emissive: 0xffffff, 
                    emissiveIntensity: 0,
                    transparent: true,
                    opacity: 0.75
                });
                const tower = new THREE.Mesh(geometry, material);

                tower.position.x = (x - gs.gridSize / 2 + 0.5) * gs.spacing;
                tower.position.y = 0;
                tower.position.z = (z - gs.gridSize + 0.5) * gs.spacing;

                this.scene.add(tower);
                this.towers.push(tower);
            }
        }

        // Set camera position
        this.camera.position.set(0, 5, 15);
        this.camera.lookAt(0, 2, 0);
    }

    /**
     * Create a starfield for the towers visualizer background
     */
    createStarfield() {
        // Number of stars to create
        const starCount = 5000;
        
        // Create geometry for the stars
        const starGeometry = new THREE.BufferGeometry();
        const starPositions = new Float32Array(starCount * 3);
        const starSizes = new Float32Array(starCount);
        const starColors = new Float32Array(starCount * 3);
        
        // Create stars in a spherical distribution around the scene
        const radius = 300; // Reduced radius to make stars appear closer
        
        for (let i = 0; i < starCount; i++) {
            // Generate random spherical coordinates
            const theta = Math.random() * Math.PI * 2; // Azimuthal angle
            const phi = Math.acos(2 * Math.random() - 1); // Polar angle
            
            // Convert to Cartesian coordinates
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);
            
            // Set positions
            starPositions[i * 3] = x;
            starPositions[i * 3 + 1] = y;
            starPositions[i * 3 + 2] = z;
            
            // Increase star sizes for better visibility
            const sizeFactor = Math.random();
            starSizes[i] = sizeFactor > 0.98 ? Math.random() * 4 + 3 : Math.random() * 2.5 + 1.0;
            
            // Vary star colors slightly (mostly white with hints of blue/yellow)
            const colorVariation = Math.random();
            if (colorVariation > 0.8) {
                // Bluish star (slightly cooler)
                starColors[i * 3] = 0.8 + Math.random() * 0.2;
                starColors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
                starColors[i * 3 + 2] = 1.0;
            } else if (colorVariation > 0.6) {
                // Yellowish star (slightly warmer)
                starColors[i * 3] = 1.0;
                starColors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
                starColors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
            } else {
                // White/neutral star
                starColors[i * 3] = 0.9 + Math.random() * 0.1;
                starColors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
                starColors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
            }
        }
        
        // Add attributes to the geometry
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
        starGeometry.setAttribute('customColor', new THREE.BufferAttribute(starColors, 3));  // Changed 'color' to 'customColor'
        
        // Create shader material for the stars
        const starMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 customColor;  // Changed from 'color' to 'customColor'
                varying vec3 vColor;
                uniform float time;
                
                void main() {
                    vColor = customColor;  // Use customColor instead
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // Make some stars twinkle by varying their size with time
                    float twinkle = sin(time * 2.0 + position.x * 10.0) * 0.2 + 0.8;
                    
                    gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    // Make stars look like small glowing orbs
                    vec2 center = vec2(0.5, 0.5);
                    float dist = length(gl_PointCoord - center);
                    
                    // Higher alpha value for better visibility
                    float alpha = smoothstep(0.5, 0.1, dist);
                    
                    // Add more brightness to the stars
                    vec3 brightColor = vColor * 1.5;
                    
                    gl_FragColor = vec4(brightColor, alpha);
                }
            `,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            vertexColors: true
        });
        
        // Create the star particle system
        this.starfield = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(this.starfield);
    }

    /**
     * Update the towers visualizer
     * Animates towers based on audio frequencies and creates a treadmill effect
     */
    updateTowersVisualizer(lowAvg, highAvg, delta) {
        if (!this.towerGridSettings) return;

        const gs = this.towerGridSettings;
        const baseTowerHeight = gs.baseTowerHeight;
        const maxScale = 50;
        const treadmillSpeed = 10.0 * delta;

        // Calculate average audio level for color changes
        let averageLevel = 0;
        for(let i = 0; i < this.dataArray.length; i++) {
            averageLevel += this.dataArray[i] / 255.0;
        }
        averageLevel /= this.dataArray.length;
        
        // Update starfield if it exists
        if (this.starfield) {
            // Update time uniform for star twinkling effect
            this.starfield.material.uniforms.time.value += delta * (1.0 + averageLevel * 2.0);
            
            // Make stars rotate very slowly for subtle movement
            this.starfield.rotation.y += delta * 0.01;
            
            // Slight pulsation with beat
            const pulseFactor = 1.0 + (lowAvg * 0.1);
            this.starfield.scale.set(pulseFactor, pulseFactor, pulseFactor);
        }

        // Update floor color based on audio data
        if (this.groundPlane) {
            // Use complementary colors to the tower colors
            const floorHue = (0.6 + averageLevel * 0.4 + 0.5) % 1.0;
            const floorSaturation = 0.7 + lowAvg * 0.3;
            const floorLightness = 0.2 + highAvg * 0.3;
            
            // Update the floor material color
            this.groundPlane.material.color.setHSL(floorHue, floorSaturation, floorLightness);
            
            // Add subtle emissive glow to the floor for more impact
            this.groundPlane.material.emissive = new THREE.Color();
            this.groundPlane.material.emissive.setHSL(floorHue, 0.9, averageLevel * 0.3);
        }

        // Update each tower
        this.towers.forEach((tower, index) => {
            // Treadmill effect - move towers forward and wrap around
            tower.position.z += treadmillSpeed;
            if (tower.position.z > gs.wrapDistanceZ / 2) {
                tower.position.z -= gs.gridSize * gs.spacing;
                tower.scale.y = 1.0;
            }

            // Audio reactivity - adjust height and color
            const freqIndex = index % this.dataArray.length;
            const value = this.dataArray[freqIndex] / 255.0;
            const targetScaleY = 1 + value * maxScale;
            tower.scale.y += (targetScaleY - tower.scale.y) * 0.1;
            tower.position.y = (baseTowerHeight * tower.scale.y) / 2 - (baseTowerHeight / 2);

            // Color changes based on audio
            const baseHue = (0.6 + averageLevel * 0.4) % 1.0;
            const towerHue = (baseHue + value * 0.3) % 1.0;
            const saturation = 0.8 + value * 0.2;
            const lightness = 0.6 + value * 0.4;
            
            tower.material.color.setHSL(towerHue, saturation, lightness);
            
            // Emissive glow effect
            const emissiveHue = (towerHue + 0.5) % 1.0;
            tower.material.emissive.setHSL(emissiveHue, 0.8, 0.5);
            tower.material.emissiveIntensity = value * 2.0;
        });

        // Ground-level camera movement
        const time = this.clock.getElapsedTime();
        
        // Set camera to ground level
        this.camera.position.y = 0.5;
        
        // Move camera forward
        const forwardSpeed = 5.0 * delta;
        this.camera.position.z -= forwardSpeed;
        
        // Add side-to-side movement
        const sideMovement = Math.sin(time * 0.5) * 2.0;
        this.camera.position.x = sideMovement;
        
        // Look ahead and slightly upward
        this.camera.lookAt(
            sideMovement * 0.5,
            2.0,
            this.camera.position.z - 10
        );
        
        // Reset camera position when it moves too far back
        if (this.camera.position.z < -50) {
            this.camera.position.z = 30;
        }
    }

    /**
     * Create the shaders visualizer
     * Uses fragment shaders to create dynamic audio-reactive patterns
     */
    createShadersVisualizer() {
        try {
            // Initialize shader-related properties
            this.shaderPlane = null;
            this.shaderMaterial = null;
            this.shaderTime = 0;
            
            // Set a dark background
            this.scene.background = new THREE.Color(0x000000);
            
            // Store the original camera for later restoration
            console.log(`Storing original camera`, {
                position: { ...this.camera.position },
                isPerspective: this.camera instanceof THREE.PerspectiveCamera
            });
            this.originalCamera = this.camera.clone();
            console.log(`Original camera stored`, {
                position: { ...this.originalCamera.position },
                isPerspective: this.originalCamera instanceof THREE.PerspectiveCamera
            });
            
            // Create a full-screen quad for the shader
            const geometry = new THREE.PlaneGeometry(2, 2);
            
            // Create shader material with uniforms for audio reactivity
            this.shaderMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    audioLevel: { value: 0.0 },
                    audioLowFreq: { value: 0.0 },
                    audioHighFreq: { value: 0.0 },
                    audioTexture: { value: null }
                },
                vertexShader: `
                    varying vec2 vUv;
                    
                    void main() {
                        vUv = uv;
                        gl_Position = vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float time;
                    uniform vec2 resolution;
                    uniform float audioLevel;
                    uniform float audioLowFreq;
                    uniform float audioHighFreq;
                    
                    varying vec2 vUv;
                    
                    // Simple noise function
                    float noise(vec2 p) {
                        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                    }
                    
                    vec3 hsv2rgb(vec3 c) {
                        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                    }
                    
                    // Function to generate vibrant colors
                    vec3 vibrantColor(float value, float offset) {
                        float hue = fract(value * 0.8 + offset);
                        float sat = 0.9;
                        float val = 0.9;
                        return hsv2rgb(vec3(hue, sat, val));
                    }
                    
                    // Function to blend colors
                    vec3 blendColors(vec3 color1, vec3 color2, float factor) {
                        return mix(color1, color2, factor);
                    }
                    
                    void main() {
                        // Center coordinates
                        vec2 uv = vUv * 2.0 - 1.0;
                        uv.x *= resolution.x / resolution.y;
                        
                        // Audio-reactive parameters
                        float bassPulse = 0.5 + audioLowFreq * 0.7;  // Increased audio reactivity
                        float treblePulse = 0.5 + audioHighFreq * 0.7;
                        float overallPulse = 0.5 + audioLevel * 0.7;
                        
                        // Create circular waves from center
                        float dist = length(uv);
                        float angle = atan(uv.y, uv.x);
                        
                        // Wave patterns affected by audio - more complex patterns
                        float wave1 = sin(dist * 10.0 - time * 2.0) * 0.5 + 0.5;
                        float wave2 = sin(dist * 15.0 - time * 1.5 + audioLevel * 5.0) * 0.5 + 0.5;
                        float wave3 = sin(angle * 8.0 + time * 0.5) * 0.5 + 0.5;
                        float wave4 = sin(dist * 20.0 - time * 2.5 + audioHighFreq * 10.0) * 0.5 + 0.5;
                        float wave5 = cos(angle * 12.0 - time * 0.7 + audioLowFreq * 2.0) * 0.5 + 0.5;
                        
                        // Create multiple patterns for more complex visuals
                        float pattern1 = wave1 * wave2 * wave3;
                        float pattern2 = wave4 * wave5;
                        float pattern3 = sin(dist * 25.0 - time) * cos(angle * 5.0 + time * 0.3);
                        
                        // Combine patterns
                        float mainPattern = smoothstep(0.2, 0.8, pattern1);
                        mainPattern *= overallPulse;
                        
                        float secondPattern = smoothstep(0.1, 0.9, pattern2);
                        secondPattern *= treblePulse;
                        
                        float thirdPattern = smoothstep(0.3, 0.7, pattern3 * 0.5 + 0.5);
                        thirdPattern *= bassPulse;
                        
                        // Create multiple colors with different hue offsets for more variety
                        float timeOffset = time * 0.05;
                        
                        // Primary color - shifts with bass
                        vec3 color1 = vibrantColor(timeOffset + audioLowFreq * 0.3, 0.0);
                        
                        // Secondary color - complementary to primary
                        vec3 color2 = vibrantColor(timeOffset + audioHighFreq * 0.2, 0.33);
                        
                        // Tertiary color - shifts differently
                        vec3 color3 = vibrantColor(timeOffset - audioLevel * 0.25, 0.66);
                        
                        // Background color with subtle patterns
                        float bgPattern1 = sin(uv.x * 20.0 + time) * sin(uv.y * 20.0 + time * 0.7);
                        float bgPattern2 = cos(uv.x * 15.0 - time * 0.5) * cos(uv.y * 15.0 - time * 0.3);
                        
                        bgPattern1 = smoothstep(0.0, 0.8, bgPattern1 * audioLevel);
                        bgPattern2 = smoothstep(0.0, 0.8, bgPattern2 * audioHighFreq);
                        
                        // Background gradient
                        vec3 bgColor1 = vibrantColor(timeOffset * 0.7, 0.5);
                        vec3 bgColor2 = vibrantColor(timeOffset * 0.7, 0.8);
                        vec3 bgColor = mix(bgColor1, bgColor2, bgPattern1 * 0.5 + 0.5);
                        
                        // Apply a vignette effect
                        float vignette = 1.0 - smoothstep(0.5, 1.5, dist);
                        
                        // Mix multiple colors based on patterns
                        vec3 finalColor = blendColors(color1, color2, pattern1);
                        finalColor = blendColors(finalColor, color3, pattern2 * 0.7);
                        
                        // Add subtle highlights
                        finalColor += color3 * thirdPattern * 0.3;
                        
                        // Mix with background
                        finalColor = mix(bgColor * 0.4, finalColor, mainPattern * vignette);
                        
                        // Add glow effect
                        finalColor += (color1 * 0.2 + color2 * 0.1) * secondPattern * (1.0 - dist);
                        
                        // Final color with background
                        gl_FragColor = vec4(finalColor, 1.0);
                    }
                `,
                side: THREE.DoubleSide
            });
            
            // Create the plane mesh
            this.shaderPlane = new THREE.Mesh(geometry, this.shaderMaterial);
            this.scene.add(this.shaderPlane);
            
            // Setup orthographic camera for full-screen quad
            console.log(`Replacing camera with orthographic camera for shaders`);
            this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            console.log(`New orthographic camera created`, {
                isOrthographic: this.camera instanceof THREE.OrthographicCamera
            });
            
            // Create an array to store audio data for texture
            this.audioDataArray = new Uint8Array(128);
            
            // Handle window resize for shader
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
            }
            
            this.resizeHandler = () => {
                if (this.shaderMaterial && this.shaderMaterial.uniforms) {
                    this.shaderMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
                }
            };
            
            window.addEventListener('resize', this.resizeHandler);
        } catch (error) {
            console.error("Error in createShadersVisualizer:", error);
            // Fallback to a simpler visualizer if shader creation fails
            this.currentStyle = 'bars';
            this.createBars();
        }
    }
    
    /**
     * Update the shaders visualizer
     * Updates shader uniforms based on audio data and time
     */
    updateShadersVisualizer(delta) {
        if (!this.shaderMaterial || !this.shaderMaterial.uniforms) return;
        
        // Update time uniform
        this.shaderTime += delta;
        this.shaderMaterial.uniforms.time.value = this.shaderTime;
        
        // Get audio data
        if (!this.analyser || !this.audioDataArray) return;
        
        this.analyser.getByteFrequencyData(this.audioDataArray);
        
        // Calculate different frequency bands
        let lowFreq = 0, midFreq = 0, highFreq = 0, overall = 0;
        const lowBound = 0;
        const lowMidBound = Math.floor(this.audioDataArray.length * 0.2);
        const midHighBound = Math.floor(this.audioDataArray.length * 0.6);
        
        for (let i = 0; i < this.audioDataArray.length; i++) {
            const normalized = this.audioDataArray[i] / 255;
            overall += normalized;
            
            if (i < lowMidBound) {
                lowFreq += normalized;
            } else if (i < midHighBound) {
                midFreq += normalized;
            } else {
                highFreq += normalized;
            }
        }
        
        // Normalize values
        lowFreq /= lowMidBound;
        midFreq /= (midHighBound - lowMidBound);
        highFreq /= (this.audioDataArray.length - midHighBound);
        overall /= this.audioDataArray.length;
        
        // Smooth the values for more pleasing visuals
        this.lowFreqSmoothed = this.lowFreqSmoothed || lowFreq;
        this.midFreqSmoothed = this.midFreqSmoothed || midFreq;
        this.highFreqSmoothed = this.highFreqSmoothed || highFreq;
        this.overallSmoothed = this.overallSmoothed || overall;
        
        const smoothingFactor = 0.1;
        this.lowFreqSmoothed += (lowFreq - this.lowFreqSmoothed) * smoothingFactor;
        this.midFreqSmoothed += (midFreq - this.midFreqSmoothed) * smoothingFactor;
        this.highFreqSmoothed += (highFreq - this.highFreqSmoothed) * smoothingFactor;
        this.overallSmoothed += (overall - this.overallSmoothed) * smoothingFactor;
        
        // Update shader uniforms with audio data
        this.shaderMaterial.uniforms.audioLevel.value = this.overallSmoothed;
        this.shaderMaterial.uniforms.audioLowFreq.value = this.lowFreqSmoothed;
        this.shaderMaterial.uniforms.audioHighFreq.value = this.highFreqSmoothed;
    }

    /**
     * Update the visualizer based on audio data
     * This is the main update loop that handles all visualizer animations
     */
    updateVisualizer() {
        if (!this.analyser) return;
        
        // Get audio data
        this.analyser.getByteFrequencyData(this.dataArray);
        const time = Date.now() * 0.0001;
        const delta = this.clock.getDelta();
        if (!this.clock) this.clock = new THREE.Clock();

        // Calculate audio levels for different frequency ranges
        let averageLevel = 0;
        let lowFreqAvg = 0;
        let highFreqAvg = 0;
        const lowFreqCutoff = Math.floor(this.dataArray.length / 3);
        const highFreqStart = Math.floor(this.dataArray.length * 2 / 3);
        for(let i = 0; i < this.dataArray.length; i++) {
            const level = this.dataArray[i] / 255.0;
            averageLevel += level;
            if (i < lowFreqCutoff) { lowFreqAvg += level; }
            else if (i >= highFreqStart) { highFreqAvg += level; }
        }
        averageLevel /= this.dataArray.length;
        lowFreqAvg /= lowFreqCutoff;
        highFreqAvg /= (this.dataArray.length - highFreqStart);

        // Update orbit controls if enabled
        if (this.orbitControls && this.orbitControls.enabled) {
            this.orbitControls.update();
        }

        // Update sun light intensity based on audio
        if (this.sunLight) {
            this.sunLight.intensity = 1.0 + averageLevel * 1.0;
        }

        // Update the active visualizer
        switch(this.currentStyle) {
            case 'bars':
                this.updateBars();
                break;
            case 'points':
                this.updatePointsVisualizer(delta);
                break;
            case 'towers':
                this.updateTowersVisualizer(lowFreqAvg, highFreqAvg, delta);
                break;
            case 'shaders':
                this.updateShadersVisualizer(delta);
                break;
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Update the bars visualizer
     * Adjusts bar heights and colors based on audio frequencies
     */
    updateBars() {
        for (let i = 0; i < this.bars.length; i++) {
            const value = this.dataArray[i] / 255;
            const bar = this.bars[i];
            bar.scale.y = 1 + value * 10;
            const hue = (i / this.bars.length) * 0.3 + 0.5;
            const color = new THREE.Color().setHSL(hue, 1, 0.5);
            bar.material.color = color;
        }
    }

    /**
     * Update the points visualizer
     * Animates points based on audio and time
     */
    updatePointsVisualizer(delta) {
        if (!this.pointsMesh) return;

        // Update shader uniforms
        this.pointsMesh.material.uniforms.time.value += delta;

        // Calculate average audio level
        let averageLevel = 0;
        for(let i = 0; i < this.dataArray.length; i++) {
            averageLevel += this.dataArray[i] / 255.0;
        }
        averageLevel /= this.dataArray.length;

        // Update audio level uniform
        this.pointsMesh.material.uniforms.audioLevel.value = averageLevel;

        // Rotate the point cloud
        this.pointsMesh.rotation.y += delta * 0.2;
        this.pointsMesh.rotation.x += delta * 0.1;

        // Dynamic camera movement
        const time = this.clock.getElapsedTime();
        const radius = 100 + Math.sin(time * 0.5) * 20;
        const angle = time * 0.2;
        
        this.camera.position.x = Math.sin(angle) * radius;
        this.camera.position.z = Math.cos(angle) * radius;
        this.camera.position.y = Math.sin(time * 0.3) * 30;
        
        this.camera.lookAt(0, 0, 0);
    }

    /**
     * Detect beat events in different frequency ranges
     */
    detectBeats(freqData, deltaTime) {
        const beat = this.beatDetectionVars;
        
        // Calculate energy in bass range (low frequencies)
        let bassEnergy = 0;
        const bassRange = Math.floor(freqData.length * 0.2); // First 20% of frequencies
        for (let i = 0; i < bassRange; i++) {
            bassEnergy += freqData[i] / 255.0;
        }
        bassEnergy /= bassRange;
        
        // Calculate energy in treble range (high frequencies)
        let trebleEnergy = 0;
        const trebleStart = Math.floor(freqData.length * 0.6); // Last 40% of frequencies
        for (let i = trebleStart; i < freqData.length; i++) {
            trebleEnergy += freqData[i] / 255.0;
        }
        trebleEnergy /= (freqData.length - trebleStart);
        
        // Smooth energy values
        beat.bassEnergy = beat.bassEnergy * 0.9 + bassEnergy * 0.1;
        beat.trebleEnergy = beat.trebleEnergy * 0.9 + trebleEnergy * 0.1;
        
        // Add current energy to history
        beat.energyHistory.push(bassEnergy);
        if (beat.energyHistory.length > 30) {
            beat.energyHistory.shift();
        }
        
        // Calculate average energy from history
        const averageEnergy = beat.energyHistory.reduce((sum, val) => sum + val, 0) / 
                             beat.energyHistory.length;
        
        // Current time for beat timing
        const currentTime = this.clock.getElapsedTime();
        
        // Detect bass beat (if energy is significantly higher than average)
        if (bassEnergy > averageEnergy * beat.beatThreshold && 
            currentTime - beat.lastBeatTime > beat.beatHoldTime) {
            
            // Trigger new beat
            beat.lastBeatTime = currentTime;
            beat.bassBeat = Math.min(bassEnergy * 2.0, 1.0);
        } else {
            // Decay beat value
            beat.bassBeat *= Math.pow(0.7, deltaTime * 10);
        }
        
        // Detect treble beat
        if (trebleEnergy > beat.trebleEnergy * 1.3) {
            beat.trebleBeat = Math.min(trebleEnergy * 1.5, 1.0);
        } else {
            // Decay treble beat value faster
            beat.trebleBeat *= Math.pow(0.5, deltaTime * 15);
        }
    }

    /**
     * Emit new particles from the center
     * Called when a beat is detected
     * Using Watanabe-inspired geometric patterns
     */
    emitParticles(count, bassIntensity, trebleIntensity) {
        // Get particle system attributes
        const positions = this.particleSystem.geometry.attributes.position;
        const colors = this.particleSystem.geometry.attributes.color;
        const sizes = this.particleSystem.geometry.attributes.size;
        
        // Calculate base properties with a minimalist aesthetic (Watanabe style)
        const baseSpeed = 15 + bassIntensity * 25; 
        const baseBurstSize = Math.floor(count * (1 + bassIntensity));
        const baseSize = 1.5 + bassIntensity * 2.5; // Smaller, more elegant particles
        
        // Number of particles to emit in this burst
        const particlesToEmit = Math.min(baseBurstSize, this.maxParticles - this.particleCount);
        
        // Choose colors based on a more minimalist/art exhibition palette
        const baseHue = (this.waveMaterial.uniforms.time.value * 0.05) % 1.0;
        const hueVariation = 0.08 + trebleIntensity * 0.1; // Less variation for cleaner look
        
        // Exhibition mode: create geometric patterns
        const patternType = Math.floor(bassIntensity * 3) % 3; // Different patterns based on intensity
        
        for (let i = 0; i < particlesToEmit; i++) {
            // Find an inactive particle slot
            let particleIndex = -1;
            for (let j = 0; j < this.maxParticles; j++) {
                if (this.particleLifetimes[j] < 0) {
                    particleIndex = j;
                    break;
                }
            }
            
            if (particleIndex === -1) break; // No free slots
            
            // Activate the particle
            this.particleLifetimes[particleIndex] = this.particleLifespan;
            
            // Set initial particle properties
            let initialVelocity = new THREE.Vector3();
            let initialPosition = new THREE.Vector3();
            
            // Different emission patterns based on audio characteristics
            switch(patternType) {
                case 0: // Circular burst (Watanabe-inspired circular patterns)
                    {
                        const angle = Math.random() * Math.PI * 2;
                        const elevation = (Math.random() - 0.5) * Math.PI * 0.5;
                        
                        initialPosition.set(0, 0, 0);
                        
                        initialVelocity.x = Math.cos(angle) * Math.cos(elevation) * baseSpeed;
                        initialVelocity.y = Math.sin(elevation) * baseSpeed;
                        initialVelocity.z = Math.sin(angle) * Math.cos(elevation) * baseSpeed;
                    }
                    break;
                    
                case 1: // Planar burst (Watanabe-inspired flat compositions)
                    {
                        const angle = Math.random() * Math.PI * 2;
                        
                        initialPosition.set(0, 0, 0);
                        
                        initialVelocity.x = Math.cos(angle) * baseSpeed;
                        initialVelocity.y = 0;
                        initialVelocity.z = Math.sin(angle) * baseSpeed;
                        
                        // Add small vertical variation
                        initialVelocity.y = (Math.random() - 0.5) * baseSpeed * 0.2;
                    }
                    break;
                    
                case 2: // Upward fountain (Watanabe-inspired vertical compositions)
                    {
                        initialPosition.set(0, 0, 0);
                        
                        const angle = Math.random() * Math.PI * 2;
                        const spread = Math.random() * 0.3; // Focused upward spray
                        
                        initialVelocity.x = Math.cos(angle) * baseSpeed * spread;
                        initialVelocity.y = baseSpeed * (0.7 + Math.random() * 0.3); // Mostly upward
                        initialVelocity.z = Math.sin(angle) * baseSpeed * spread;
                    }
                    break;
            }
            
            // Set particle position
            positions.array[particleIndex * 3] = initialPosition.x;
            positions.array[particleIndex * 3 + 1] = initialPosition.y;
            positions.array[particleIndex * 3 + 2] = initialPosition.z;
            
            // Set particle color
            // Use a more curated color palette inspired by Watanabe's work
            let hue = baseHue + (Math.random() - 0.5) * hueVariation;
            if (hue < 0) hue += 1;
            if (hue > 1) hue -= 1;
            
            // Higher saturation for more vibrant visuals
            const saturation = 0.7 + Math.random() * 0.3;
            const lightness = 0.5 + trebleIntensity * 0.2;
            
            const color = new THREE.Color().setHSL(hue, saturation, lightness);
            colors.array[particleIndex * 3] = color.r;
            colors.array[particleIndex * 3 + 1] = color.g;
            colors.array[particleIndex * 3 + 2] = color.b;
            
            // Set particle size
            const randomSize = baseSize * (0.8 + Math.random() * 0.4);
            sizes.array[particleIndex] = randomSize;
            
            // Store particle data
            this.waveParticles[particleIndex] = {
                velocity: initialVelocity,
                initialSize: randomSize,
                frameInteractions: 0
            };
        }
        
        // Mark attributes as needing update
        positions.needsUpdate = true;
        colors.needsUpdate = true;
        sizes.needsUpdate = true;
    }
    
    /**
     * Update the wave visualizer
     * Animates particles based on audio beats and handles exhibition space interactions
     */
    updateWaveVisualizer(delta) {
        if (!this.particleSystem) return;
        
        // Update time uniform
        this.waveMaterial.uniforms.time.value += delta;
        
        // Get frequency data
        const freqData = this.dataArray;
        
        // Detect beats in different frequency ranges
        this.detectBeats(freqData, delta);
        
        // Calculate average audio level
        let averageLevel = 0;
        for (let i = 0; i < freqData.length; i++) {
            averageLevel += freqData[i] / 255.0;
        }
        averageLevel /= freqData.length;
        
        // Update exhibition frames based on audio
        this.updateExhibitionSpace(delta, averageLevel);
        
        // Get particle system attributes
        const positions = this.particleSystem.geometry.attributes.position;
        const colors = this.particleSystem.geometry.attributes.color;
        const sizes = this.particleSystem.geometry.attributes.size;
        
        // Update emission cooldown
        if (this.beatDetectionVars.emitCooldown > 0) {
            this.beatDetectionVars.emitCooldown -= delta;
        }
        
        // Emit particles when a bass beat is detected
        if (this.beatDetectionVars.bassBeat > 0.4 && this.beatDetectionVars.emitCooldown <= 0) {
            const emissionCount = Math.floor(this.emissionRate * this.beatDetectionVars.bassBeat);
            
            this.emitParticles(
                emissionCount, 
                this.beatDetectionVars.bassBeat,
                this.beatDetectionVars.trebleBeat
            );
            
            this.beatDetectionVars.emitCooldown = 0.1;
        }
        
        // Smaller continuous emissions for visual interest
        if (this.beatDetectionVars.trebleBeat > 0.5 && Math.random() < this.beatDetectionVars.trebleBeat * 0.2) {
            this.emitParticles(
                Math.floor(3 * this.beatDetectionVars.trebleBeat),
                this.beatDetectionVars.bassBeat * 0.4,
                this.beatDetectionVars.trebleBeat
            );
        }
        
        // Emit some particles with overall audio level for continuous visual interest
        if (Math.random() < averageLevel * 0.1) {
            this.emitParticles(
                Math.floor(2 * averageLevel),
                averageLevel,
                averageLevel
            );
        }
        
        // Update all particles
        let activeCount = 0;
        
        for (let i = 0; i < this.maxParticles; i++) {
            // Skip inactive particles
            if (this.particleLifetimes[i] < 0) continue;
            
            // Update lifetime
            this.particleLifetimes[i] -= delta;
            
            // If particle died this frame, make it inactive
            if (this.particleLifetimes[i] < 0) {
                sizes.array[i] = 0;
                continue;
            }
            
            // Count active particles
            activeCount++;
            
            // Calculate life factor (1.0 when new, 0.0 when dead)
            const lifeFactor = this.particleLifetimes[i] / this.particleLifespan;
            
            // Update particle position based on velocity
            if (this.waveParticles[i]) {
                // Store old position for frame collision detection
                const oldX = positions.array[i * 3];
                const oldY = positions.array[i * 3 + 1];
                const oldZ = positions.array[i * 3 + 2];
                
                // Update position
                positions.array[i * 3] += this.waveParticles[i].velocity.x * delta;
                positions.array[i * 3 + 1] += this.waveParticles[i].velocity.y * delta;
                positions.array[i * 3 + 2] += this.waveParticles[i].velocity.z * delta;
                
                // Exhibition frame interactions (Watanabe-inspired)
                // Check if particle hits a frame
                for (let j = 0; j < this.exhibitionFrames.length; j++) {
                    const frame = this.exhibitionFrames[j];
                    const frameBounds = {
                        minX: frame.position.x - frame.geometry.parameters.width/2,
                        maxX: frame.position.x + frame.geometry.parameters.width/2,
                        minY: frame.position.y - frame.geometry.parameters.height/2,
                        maxY: frame.position.y + frame.geometry.parameters.height/2,
                        z: frame.position.z
                    };
                    
                    // Detect passing through frame
                    if (oldZ < frameBounds.z && positions.array[i * 3 + 2] >= frameBounds.z) {
                        if (positions.array[i * 3] >= frameBounds.minX &&
                            positions.array[i * 3] <= frameBounds.maxX &&
                            positions.array[i * 3 + 1] >= frameBounds.minY &&
                            positions.array[i * 3 + 1] <= frameBounds.maxY) {
                            
                            // Frame interaction - change velocity and color (artistic transformation)
                            this.waveParticles[i].velocity.multiplyScalar(0.8); // Slow down
                            
                            // Change color slightly for exhibition effect
                            const hue = (colors.array[i * 3] + colors.array[i * 3 + 1] + colors.array[i * 3 + 2]) / 3;
                            const newColor = new THREE.Color().setHSL(
                                (hue + 0.1 * j) % 1.0, 
                                0.8, 
                                0.5 + j * 0.1
                            );
                            
                            colors.array[i * 3] = newColor.r;
                            colors.array[i * 3 + 1] = newColor.g;
                            colors.array[i * 3 + 2] = newColor.b;
                            
                            // Record interaction
                            this.waveParticles[i].frameInteractions++;
                        }
                    }
                }
                
                // Minimalist motion - less chaotic for Watanabe style
                this.waveParticles[i].velocity.y -= 0.5 * delta; // Less gravity
                this.waveParticles[i].velocity.multiplyScalar(0.995); // Subtle air resistance
                
                // Size changes based on pattern type and frame interactions
                let sizeFactor = 1.0;
                
                if (this.waveParticles[i].frameInteractions > 0) {
                    // Particles get slightly larger with each frame they pass through
                    sizeFactor = 1.0 + (this.waveParticles[i].frameInteractions * 0.1);
                }
                
                // Fade in/out based on life
                const fadeIn = lifeFactor < 0.9 ? lifeFactor / 0.9 : 1.0;
                const fadeOut = lifeFactor < 0.2 ? lifeFactor / 0.2 : 1.0;
                
                sizes.array[i] = this.waveParticles[i].initialSize * sizeFactor * fadeIn * fadeOut;
            }
        }
        
        // Update particle count
        this.particleCount = activeCount;
        
        // Mark attributes as needing update
        positions.needsUpdate = true;
        colors.needsUpdate = true;
        sizes.needsUpdate = true;
        
        // Update exhibition camera
        this.updateExhibitionCamera(delta, averageLevel);
    }
    
    /**
     * Update exhibition space elements
     */
    updateExhibitionSpace(delta, audioLevel) {
        // Animate exhibition frames based on audio
        this.exhibitionFrames.forEach((frame, index) => {
            // Subtle rotation based on audio
            frame.rotation.z = Math.sin(this.waveMaterial.uniforms.time.value * 0.2 + index) * 0.05;
            
            // Pulse opacity based on audio level
            const material = frame.material;
            material.opacity = 0.1 + index * 0.05 + audioLevel * 0.2;
            
            // Subtle scale changes
            const baseBeat = this.beatDetectionVars.bassBeat;
            const scale = 1.0 + baseBeat * 0.05;
            frame.scale.set(scale, scale, 1);
        });
        
        // Make floor react to heavy bass
        if (this.exhibitionFloor && this.beatDetectionVars.bassBeat > 0.7) {
            // Create ripple effect on floor
            const material = this.exhibitionFloor.material;
            material.color.setHSL(
                this.waveMaterial.uniforms.time.value * 0.1 % 1.0,
                0.2,
                0.1 + this.beatDetectionVars.bassBeat * 0.1
            );
        }
    }
    
    /**
     * Update camera movement for exhibition view
     */
    updateExhibitionCamera(delta, audioLevel) {
        // Subtle camera movement based on audio
        const time = this.clock.getElapsedTime();
        
        // Base position
        const basePosY = 40;
        const basePosZ = 130;
        
        // Apply subtle movement
        this.camera.position.y = basePosY + Math.sin(time * 0.2) * 5.0;
        this.camera.position.z = basePosZ + Math.sin(time * 0.1) * 10.0;
        
        // Subtle rotation
        this.camera.lookAt(
            Math.sin(time * 0.05) * 10.0,
            10 + Math.sin(time * 0.1) * 5.0,
            0
        );
    }

    /**
     * Main animation loop
     * Handles continuous updates and rendering
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update orbit controls if enabled
        if (this.orbitControls && this.orbitControls.enabled) {
            this.orbitControls.update();
        }

        // Update visualizer
        this.updateVisualizer();

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Update the track list display
     */
    updateTrackList() {
        const trackList = document.getElementById('track-list');
        if (!trackList) return;
        
        // Clear the list
        trackList.innerHTML = '';
        
        if (this.audioFiles.length === 0) {
            // Show empty state
            const emptyItem = document.createElement('li');
            emptyItem.className = 'empty-track-list';
            emptyItem.textContent = 'No tracks uploaded';
            trackList.appendChild(emptyItem);
            return;
        }
        
        // Add each track to the list
        this.audioFiles.forEach((file, index) => {
            const trackItem = document.createElement('li');
            
            // Format the display name nicely
            let displayName = file.name.replace(/\.[^/.]+$/, ""); // Remove file extension
            displayName = displayName.replace(/[_-]/g, " "); // Replace underscores and hyphens with spaces
            
            // Capitalize first letter of each word
            displayName = displayName.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            trackItem.textContent = `${index + 1}. ${displayName}`;
            
            // Mark the current track
            if (index === this.currentTrackIndex) {
                trackItem.className = 'active';
            }
            
            // Add click handler to play the track
            trackItem.addEventListener('click', () => {
                if (index !== this.currentTrackIndex) {
                    this.currentTrackIndex = index;
                    this.loadAudioFile(this.audioFiles[index]);
                    this.updateTrackList();
                }
            });
            
            trackList.appendChild(trackItem);
        });
    }
}

// Initialize the visualizer only after user login
window.addEventListener('userLoggedIn', () => {
    window.visualizer = new Visualizer();
});
