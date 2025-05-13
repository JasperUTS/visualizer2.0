export const ringVertexShader = `
    uniform float time;
    uniform float ringRadius;
    uniform float ringThickness;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying float vElevation;

    void main() {
        vUv = uv;
        vPosition = position;
        
        // Calculate distance from center
        float dist = length(position.xy);
        
        // Create ring shape
        float ring = smoothstep(ringRadius - ringThickness, ringRadius, dist) * 
                    smoothstep(ringRadius + ringThickness, ringRadius, dist);
        
        // Add some terrain variation
        float elevation = sin(position.x * 2.0 + time) * 0.1 + 
                         sin(position.y * 3.0 + time * 0.5) * 0.1;
        
        vec3 newPosition = position;
        newPosition.z += elevation * ring;
        
        vElevation = elevation;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`;

export const ringFragmentShader = `
    uniform float time;
    uniform vec3 ringColor;
    uniform float atmosphereIntensity;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying float vElevation;

    void main() {
        // Calculate distance from center
        float dist = length(vPosition.xy);
        
        // Base ring color
        vec3 color = ringColor;
        
        // Add terrain variation
        float terrain = vElevation * 0.5 + 0.5;
        color = mix(color * 0.8, color * 1.2, terrain);
        
        // Add atmospheric glow
        float atmosphere = smoothstep(0.0, 0.5, vElevation) * atmosphereIntensity;
        color += vec3(0.5, 0.7, 1.0) * atmosphere;
        
        // Add some noise for detail
        float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
        color += noise * 0.1;
        
        // Add rim lighting
        float rim = 1.0 - abs(dot(normalize(vPosition), vec3(0.0, 0.0, 1.0)));
        color += vec3(0.5, 0.7, 1.0) * rim * 0.5;
        
        gl_FragColor = vec4(color, 1.0);
    }
`; 