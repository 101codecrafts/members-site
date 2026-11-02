/**
 * The sandboxed iframe document for the code canvas playground.
 *
 * Security model:
 *  - iframe sandbox="allow-scripts" WITHOUT allow-same-origin → opaque origin:
 *    no access to the parent page, cookies, localStorage or the member's session.
 *  - CSP inside the frame: no network (connect-src/img-src limited to data:/blob:),
 *    so learner code cannot exfiltrate anything.
 *  - Code arrives by postMessage (never string-concatenated into HTML).
 */
export const PLAYGROUND_PRESETS: Record<string, { label: string; code: string }> = {
  orbits: {
    label: "Orbits (animation)",
    code: `// draw(t) runs every frame. t = seconds since start.
// Globals: canvas, ctx, width, height, random(a,b), noise(x), palette
function draw(t) {
  ctx.fillStyle = "rgba(1,29,60,0.18)";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 12; i++) {
    const a = t * (0.4 + i * 0.07) + i;
    const r = 30 + i * 18;
    const x = width / 2 + Math.cos(a) * r;
    const y = height / 2 + Math.sin(a) * r;
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(x - 6, y - 6, 12, 12);
  }
}`,
  },
  grid: {
    label: "Brutalist grid (static)",
    code: `// setup() runs once. Try changing the cell size!
function setup() {
  ctx.fillStyle = "#f7f8f8";
  ctx.fillRect(0, 0, width, height);
  const cell = 40;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (random(0, 1) < 0.35) {
        ctx.fillStyle = palette[Math.floor(random(0, palette.length))];
        ctx.fillRect(x + 4, y + 4, cell - 8, cell - 8);
        ctx.strokeStyle = "#10181f";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      }
    }
  }
  console.log("Grid drawn:", width, "x", height);
}`,
  },
  flow: {
    label: "Flow field (noise)",
    code: `let pts = [];
function setup() {
  ctx.fillStyle = "#011d3c"; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 400; i++) pts.push({ x: random(0, width), y: random(0, height) });
}
function draw(t) {
  ctx.strokeStyle = "rgba(5,230,242,0.25)";
  for (const p of pts) {
    const a = noise(p.x * 0.01 + t * 0.1) * Math.PI * 4;
    const nx = p.x + Math.cos(a) * 2, ny = p.y + Math.sin(a) * 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
    p.x = (nx + width) % width; p.y = (ny + height) % height;
  }
}`,
  },
};

export const PLAYGROUND_SRCDOC = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:">
<style>html,body{margin:0;height:100%;background:#fff;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas id="c"></canvas><script>
(function(){
  var canvas=document.getElementById('c'), ctx=canvas.getContext('2d'), raf=0, started=0;
  var palette=['#fc8c0c','#05e6f2','#011d3c','#f7f8f8','#10181f'];
  function size(){ var r=canvas.getBoundingClientRect(); canvas.width=Math.max(1,Math.round(r.width)); canvas.height=Math.max(1,Math.round(r.height)); }
  function post(type,data){ parent.postMessage({__101play:true,type:type,data:data},'*'); }
  ['log','warn','error'].forEach(function(k){ var o=console[k]; console[k]=function(){ try{ post('console',{level:k,text:Array.prototype.map.call(arguments,function(a){try{return typeof a==='string'?a:JSON.stringify(a)}catch(e){return String(a)}}).join(' ')}) }catch(e){} o.apply(console,arguments); }; });
  function random(a,b){ return a+Math.random()*(b-a); }
  var perm=[]; for(var i=0;i<512;i++) perm[i]=Math.random();
  function noise(x){ var i=Math.floor(x), f=x-i, u=f*f*(3-2*f); var a=perm[i&511], b=perm[(i+1)&511]; return a+(b-a)*u; }
  window.onerror=function(m,s,l){ post('console',{level:'error',text:String(m)+(l?' (line '+l+')':'')}); };
  window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.type==='run'){
      cancelAnimationFrame(raf); size(); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
      try{
        var api=new Function('canvas','ctx','width','height','random','noise','palette', String(d.code)+'\\n;return {setup:typeof setup==="function"?setup:null,draw:typeof draw==="function"?draw:null};');
        var fns=api(canvas,ctx,canvas.width,canvas.height,random,noise,palette);
        if(fns.setup) fns.setup();
        if(fns.draw){ started=performance.now(); var loop=function(now){ try{ fns.draw((now-started)/1000); raf=requestAnimationFrame(loop);}catch(err){ post('console',{level:'error',text:String(err)}); } }; raf=requestAnimationFrame(loop); }
        post('ran',{});
      }catch(err){ post('console',{level:'error',text:String(err)}); }
    } else if(d.type==='stop'){ cancelAnimationFrame(raf); }
    else if(d.type==='export'){ try{ post('export',{url:canvas.toDataURL('image/png')}); }catch(err){ post('console',{level:'error',text:String(err)}); } }
  });
  post('ready',{});
})();
<\/script></body></html>`;
