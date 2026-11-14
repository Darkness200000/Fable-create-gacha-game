/* Veilfall — living sky: a full-screen GLSL nebula + starfield behind everything */
(function () {
  const B = G.Bg = {}, cv = document.getElementById('bg');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  let cur = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], tgt = cur, pulse = 0, prog, U = {};
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  B.set = pal => { tgt = pal.map(hex); if (!gl) cv.style.background = `radial-gradient(ellipse at 50% 30%, ${pal[1]}, ${pal[0]} 70%)`; };
  B.pulse = v => { pulse = Math.max(pulse, v); };
  const FS = `precision mediump float;
uniform vec2 R; uniform float T, P; uniform vec3 A, B, C;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<5;i++){ v += a*n(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }
float stars(vec2 uv, float s, float t){ vec2 g = floor(uv*s), f = fract(uv*s) - .5; float r = h(g);
  vec2 o = vec2(h(g+3.1), h(g+7.7)) - .5; float d = length(f - o*.7);
  return smoothstep(.06 + r*.05, 0., d) * step(.82, r) * (.55 + .45*sin(t*(1.+r*3.) + r*40.)); }
void main(){
  vec2 uv = gl_FragCoord.xy / R.y; vec2 c = (gl_FragCoord.xy - .5*R) / R.y; float t = T*.035;
  vec2 q = vec2(fbm(uv*1.6 + t), fbm(uv*1.6 - t + 4.3));
  float f = fbm(uv*2.2 + q*1.6 + vec2(t*.6, -t));
  vec3 col = mix(A, B, smoothstep(.25, .8, f));
  col = mix(col, C, pow(smoothstep(.5, .98, f + q.x*.25), 2.2) * .7);
  float band = exp(-pow((c.y - .12 + .1*sin(c.x*2.2 + T*.12) + (q.y-.5)*.3) * 3.2, 2.));
  col += C * band * .16 * (.6 + .4*sin(c.x*9. + T*.3 + q.x*6.));
  float s = stars(uv, 26., T) + stars(uv + 3.3, 52., T*1.3)*.7 + stars(uv + 7.1, 95., T*.8)*.45;
  col += vec3(s) * (1. - smoothstep(.55, .95, f)*.6);
  col += C * P * (.35 + .65*exp(-dot(c,c)*3.));
  col *= 1. - .55*dot(c,c);
  col += (h(gl_FragCoord.xy + T) - .5) * .018;
  gl_FragColor = vec4(col, 1.);
}`;
  function init() {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.bindAttribLocation(prog, 0, 'p'); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    ['R', 'T', 'P', 'A', 'B', 'C'].forEach(k => U[k] = gl.getUniformLocation(prog, k));
  }
  function size() {
    const s = Math.min(1, 900 / Math.max(innerWidth, innerHeight)) * 0.75;
    cv.width = Math.max(2, innerWidth * s | 0); cv.height = Math.max(2, innerHeight * s | 0);
    if (gl) gl.viewport(0, 0, cv.width, cv.height);
  }
  B.frame = (time, dt) => {
    if (!gl) return;
    const k = Math.min(1, dt * 1.8);
    cur = cur.map((c, i) => c.map((v, j) => v + (tgt[i][j] - v) * k));
    pulse *= Math.pow(0.08, dt);
    gl.uniform2f(U.R, cv.width, cv.height); gl.uniform1f(U.T, time); gl.uniform1f(U.P, pulse);
    gl.uniform3fv(U.A, cur[0]); gl.uniform3fv(U.B, cur[1]); gl.uniform3fv(U.C, cur[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  if (gl) init(); addEventListener('resize', size); size();
})();
