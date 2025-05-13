export const waveVertexShader = `
    uniform float time;
    uniform float amplitude;
    uniform float frequency;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
        vUv = uv;
        
        // Create wave effect
        float elevation = sin(position.x * frequency + time) * amplitude;
        vec3 newPosition = position;
        newPosition.z += elevation;
        
        vElevation = elevation;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`;

export const waveFragmentShader = `
    uniform vec3 colorA;
    uniform vec3 colorB;
    varying vec2 vUv;
    varying float vElevation;

    void main() {
        // Mix colors based on elevation
        vec3 color = mix(colorA, colorB, vElevation * 0.5 + 0.5);
        gl_FragColor = vec4(color, 1.0);
    }
`; 