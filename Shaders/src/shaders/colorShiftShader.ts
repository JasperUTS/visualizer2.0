export const colorShiftVertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const colorShiftFragmentShader = `
    uniform float time;
    uniform float speed;
    uniform float intensity;
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
        // Create a dynamic color pattern
        float r = sin(vUv.x * 10.0 + time * speed) * 0.5 + 0.5;
        float g = sin(vUv.y * 10.0 + time * speed * 1.2) * 0.5 + 0.5;
        float b = sin((vUv.x + vUv.y) * 5.0 + time * speed * 0.8) * 0.5 + 0.5;
        
        // Add some noise
        float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
        
        vec3 color = vec3(r, g, b) * intensity + noise * (1.0 - intensity);
        gl_FragColor = vec4(color, 1.0);
    }
`; 