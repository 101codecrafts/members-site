const fs=require('fs');const src=fs.readFileSync('src/js/api.js','utf8');
const m=src.match(/const V1_MAP = (\[[\s\S]*?\n  \]);/)[1];const V1_MAP=eval(m);
function toV1(path){if(path.startsWith("/v1/"))return path;for(const [re,to] of V1_MAP)if(re.test(path))return to&&path.replace(re,to);return null;}
const routes=fs.readFileSync('qa/routes_all.txt','utf8').trim().split('\n').map(r=>new RegExp('^'+r.replace(/\[[^\]]+\]/g,'[^/]+')+'$'));
const calls=[...src.matchAll(/backend\(\s*([`"][^`"]+[`"](?:\s*\+\s*[\w.()]+)?)|post\(\s*([`"][^`"]+[`"])/g)].map(x=>(x[1]||x[2]).replace(/[`"]/g,'').replace(/\s*\+\s*[\w.()]+/,'X'));
for(const c of [...new Set(calls)]){const p=c.replace(/\$\{[^}]+\}/g,'X').split('?')[0];const v=toV1(p);const ok=v&&routes.some(r=>r.test(v.split('?')[0]));console.log((v?(ok?'OK  ':'404 '):'NONE')+' '+c+' -> '+v);}
