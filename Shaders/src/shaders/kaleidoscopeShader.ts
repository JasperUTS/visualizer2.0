export const kaleidoscopeVertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;

    void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const kaleidoscopeFragmentShader = `
    uniform float time;
    uniform float segments;
    uniform float speed;
    uniform float zoom;
    uniform vec3 color1;
    uniform vec3 color2;
    uniform float patternIntensity;
    varying vec2 vUv;
    varying vec3 vPosition;

    // Function to create a repeating pattern
    float pattern(vec2 p) {
        p = p * zoom;
        float t = time * speed;
        
        // Create base pattern
        float pattern = sin(p.x * 10.0 + t) * 
                       sin(p.y * 10.0 + t * 0.5) * 
                       sin((p.x + p.y) * 5.0 + t * 0.25);
        
        // Add some noise
        float noise = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        
        return pattern * patternIntensity + noise * (1.0 - patternIntensity);
    }

    void main() {
        // Center the coordinates
        vec2 centered = vUv * 2.0 - 1.0;
        
        // Calculate angle and radius
        float angle = atan(centered.y, centered.x);
        float radius = length(centered);
        
        // Create kaleidoscope effect
        float segmentAngle = 2.0 * 3.14159 / segments;
        float normalizedAngle = mod(angle, segmentAngle) / segmentAngle;
        
        // Create pattern coordinates
        vec2 patternCoord = vec2(normalizedAngle, radius);
        
        // Generate pattern
        float p = pattern(patternCoord);
        
        // Mix colors based on pattern
        vec3 color = mix(color1, color2, p);
        
        // Add radial gradient
        float radialGradient = 1.0 - radius;
        color *= radialGradient;
        
        // Add some glow
        float glow = sin(radius * 10.0 - time * speed) * 0.5 + 0.5;
        color += vec3(0.5, 0.7, 1.0) * glow * 0.2;
        
        gl_FragColor = vec4(color, 1.0);
    }
`; 