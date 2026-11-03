/* engine 3: WebGL2 instanced glyph atlas. Tokens are rasterised once into a texture; one instanced draw per frame;
   drift, wrap and breathing are computed in the vertex shader, so per-frame JS = 2 uniforms + 1 draw call. 30fps. */
(function () {
  var el = CCH.layer(), cv = document.createElement("canvas"), gl = cv.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
  if (!gl) { var s = document.createElement("script"); s.src = "/proto-bg/canvas.js"; document.head.appendChild(s); return; }
  el.appendChild(cv);
  var VS = "#version 300 es\nin vec2 q;in vec4 a0;in vec4 a1;in vec4 a2;in vec2 a3;uniform vec2 R;uniform float t;uniform vec4 G[24];uniform int NG;out vec2 uv;out vec4 col;" +
    "void main(){vec2 o=mod(a0.xy+a0.zw*t,R+80.)-40.,c0=o+a1.xy*.5,p=o+q*a1.xy;float k=1.;for(int i=0;i<24;i++){if(i>=NG)break;vec4 g=G[i];vec2 d=max(max(g.xy-c0,c0-g.xy-g.zw),0.);k=min(k,.1+.9*clamp((length(d)-max(a1.x,a1.y)*.5)/28.,0.,1.));}" +
    "uv=vec2(mix(a1.z,a1.w,q.x),q.y);col=vec4(a2.rgb,k*a2.a*(.75+.25*sin(t*a3.y+a3.x)));" +
    "vec2 c=p/R*2.-1.;gl_Position=vec4(c.x,-c.y,0,1);}";
  var FS = "#version 300 es\nprecision mediump float;in vec2 uv;in vec4 col;uniform sampler2D T;out vec4 o;void main(){float a=texture(T,uv).a*col.a;o=vec4(col.rgb*a,a);}";
  function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  var uR = gl.getUniformLocation(pr, "R"), uT = gl.getUniformLocation(pr, "t"), uG = gl.getUniformLocation(pr, "G"), uN = gl.getUniformLocation(pr, "NG"), vao = gl.createVertexArray(), ib = gl.createBuffer(), tex = gl.createTexture(), N = 0, W, H;
  gl.bindVertexArray(vao);
  var qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,1,0,0,1,1,1]), gl.STATIC_DRAW);
  var lq = gl.getAttribLocation(pr, "q"); gl.enableVertexAttribArray(lq); gl.vertexAttribPointer(lq, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, ib);
  [["a0", 4, 0], ["a1", 4, 16], ["a2", 4, 32], ["a3", 2, 48]].forEach(function (a) { var l = gl.getAttribLocation(pr, a[0]); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, a[1], gl.FLOAT, false, 56, a[2]); gl.vertexAttribDivisor(l, 1); });
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function setup() {
    var dpr = CCH.dpr(); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); gl.viewport(0, 0, cv.width, cv.height);
    var F = CCBG.field(W, H, CCH.theme()), toks = ["+X"], idx = { "+X": 0 }; F.g.forEach(function (G) { if (!(G.t in idx)) { idx[G.t] = toks.length; toks.push(G.t); } });
    var px = Math.ceil(22 * dpr), ah = Math.ceil(px * 1.3), c = document.createElement("canvas"), x = c.getContext("2d"), f = px + 'px "CC Mono",monospace', u = [], xx = 0;
    x.font = f; var ws = toks.map(function (t) { return t === "+X" ? Math.round(17 * dpr) : Math.ceil(x.measureText(t).width) + 4; });
    c.width = ws.reduce(function (a, b) { return a + b; }, 0); c.height = ah; x.font = f; x.textBaseline = "top"; x.fillStyle = "#fff";
    toks.forEach(function (t, i) { if (t === "+X") { var m = Math.round(ah / 2), a = Math.round(6 * dpr), cx = xx + Math.round(8 * dpr), lw = Math.max(1, Math.round(dpr)); x.fillRect(cx - a, m, 2 * a + lw, lw); x.fillRect(cx, m - a, lw, 2 * a + lw); } else x.fillText(t, xx + 2, Math.round(px * .12)); u.push([xx / c.width, (xx + ws[i]) / c.width, ws[i]]); xx += ws[i]; });
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    var d = new Float32Array((F.g.length + F.x.length) * 14); F.g.forEach(function (G, i) { var k = u[idx[G.t]], sc = G.s / 22, cl = rgb(G.c);
      d.set([G.x, G.y, G.vx, G.vy, k[2] / dpr * sc, ah / dpr * sc, k[0], k[1], cl[0], cl[1], cl[2], G.a, G.ph, G.f], i * 14); });
    var kx = u[0], xw = kx[2] / dpr, xh = ah / dpr; F.x.forEach(function (X, i) { var cl = rgb(X.c);
      d.set([X.x - Math.round(8 * dpr) / dpr + 40, X.y - Math.round(ah / 2) / dpr + 40, 0, 0, xw, xh, kx[0], kx[1], cl[0], cl[1], cl[2], X.a / .75, 0, 0], (F.g.length + i) * 14); });
    gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); N = F.g.length + F.x.length; L.once();
  }
  function frame(t) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform2f(uR, W, H); gl.uniform1f(uT, t); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N); }
  var L = CCLOOP(frame, 30), red = CCH.reduced();
  CCH.guard(function (r) { var a = new Float32Array(96); r.forEach(function (q, i) { a.set(q, i * 4); }); gl.uniform4fv(uG, a); gl.uniform1i(uN, r.length); if (red && N) L.once(); });
  (document.fonts ? document.fonts.load('22px "CC Mono"') : Promise.resolve()).then(function () { setup(); if (!red) L.start(); });
  CCH.onResize(setup); CCH.onTheme(setup);
  CCH.onPause(el, function (p) { if (red) return; p ? L.stop() : L.start(); });
  cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); L.stop(); });
})();
