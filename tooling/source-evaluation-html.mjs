/** Standalone read-only report. Embedded content is escaped as data; source
 * pixels and native geometry share the saved background transform.
 * @param {{title?:string,source:{dataUrl:string,width:number,height:number},after:{project:any,report:any},before?:{project:any,report:any}}} data */
export function sourceEvaluationHtml(data) {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>户型重建对照</title><style>body{font:15px system-ui;margin:24px;color:#17202a;background:#f5f6f8}main{max-width:1280px;margin:auto}button{padding:9px 16px;margin:4px;border:1px solid #9ba6b2;border-radius:6px;background:white;cursor:pointer}button[aria-pressed=true]{background:#193d68;color:white}svg{display:block;width:100%;max-height:78vh;background:white;border:1px solid #ccc}table{border-collapse:collapse;background:white;margin:16px 0}th,td{padding:8px 16px;border:1px solid #ccd3dc;text-align:left}li{margin:8px 0}#status{color:#42536a}</style>
<main><h1 id="title"></h1><p>冻结观察的程序对照。蓝色为墙，绿色为门，紫色为窗，橙色为问题位置。报警数量不代表识图准确率；人工修正次数与耗时未测量。</p>
<nav aria-label="对照版本"><button data-view="source">原图</button><button data-view="before">改造前叠图</button><button data-view="after">改造后叠图</button></nav><p id="status"></p><svg id="plan" role="img" aria-label="原图与重建几何叠加"></svg><div id="summary"></div><ol id="issues"></ol></main>
<script id="data" type="application/json">${payload}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),svg=document.getElementById('plan'),ns='http://www.w3.org/2000/svg';
document.getElementById('title').textContent=data.title||'户型重建对照';
const element=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
function show(view){
document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
svg.replaceChildren();svg.setAttribute('viewBox','0 0 '+data.source.width+' '+data.source.height);svg.append(element('image',{href:data.source.dataUrl,x:0,y:0,width:data.source.width,height:data.source.height}));
document.getElementById('issues').replaceChildren();document.getElementById('summary').replaceChildren();
const chosen=data[view];document.getElementById('status').textContent=view==='source'?'仅显示原始像素':chosen?'待审状态和运行时编译结果见下表；未进行整屋漫游验收。':'未提供改造前工程。';if(view==='source'||!chosen)return;
for(const f of chosen.project.floors){const bg=f.backgroundImage;if(!bg)continue;const a=bg.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),point=p=>{const x=(p.x-bg.position.x)/bg.scale,y=(p.y-bg.position.y)/bg.scale;return{x:c*x+s*y+data.source.width/2,y:-s*x+c*y+data.source.height/2};};
const line=(points,color,width)=>{svg.append(element('polyline',{points:points.map(p=>{const q=point(p);return q.x+','+q.y;}).join(' '),fill:'none',stroke:color,'stroke-width':width,'vector-effect':'non-scaling-stroke'}));};
for(const w of f.walls){const at=t=>w.curvePoint?{x:(1-t)*(1-t)*w.start.x+2*(1-t)*t*w.curvePoint.x+t*t*w.end.x,y:(1-t)*(1-t)*w.start.y+2*(1-t)*t*w.curvePoint.y+t*t*w.end.y}:{x:w.start.x+(w.end.x-w.start.x)*t,y:w.start.y+(w.end.y-w.start.y)*t};line(Array.from({length:25},(_,i)=>at(i/24)),'#006bd6',1.8);
for(const[kind,color]of [['doors','#008b45'],['windows','#a020cb']])for(const o of f[kind].filter(o=>o.wallId===w.id)){const length=Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y);if(w.curvePoint)continue;const half=o.width/length/2;line([at(o.position-half),at(o.position+half)],color,5);}}
for(const issue of (chosen.project.architectureReview?.issues||[]).filter(i=>!i.resolved)){if(issue.floorId!==f.id||!issue.position)continue;const p=point(issue.position);svg.append(element('circle',{cx:p.x,cy:p.y,r:5,fill:'none',stroke:'#dc7600','stroke-width':2,'vector-effect':'non-scaling-stroke'}));}}
const r=chosen.report,rows=[['原生墙/门/窗',[r.counts.walls,r.counts.doors,r.counts.windows].join(' / ')],['原生房间/家具',r.counts.rooms+' / '+r.counts.furniture],['标注条数',r.pipeline.noteCount],['直接问题',r.pipeline.rootFindings??'旧结果未分类'],['受阻项',r.pipeline.blockedFindings??'旧结果未分类'],['已检查宿主的开口',r.pipeline.hostAssessedOpenings??'未记录'],['原图参考评估',r.sourceReview.status],['运行时编译',r.runtime.status+(r.runtime.error?'：'+r.runtime.error:'')]];
const table=document.createElement('table');for(const[k,v]of rows){const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');th.textContent=k;td.textContent=String(v);tr.append(th,td);table.append(tr);}document.getElementById('summary').append(table);
for(const issue of chosen.project.architectureReview?.issues||[]){if(issue.resolved)continue;const li=document.createElement('li');li.textContent=(issue.category?'['+issue.category+'] ':'')+issue.message;document.getElementById('issues').append(li);}}
document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));if(!data.before)document.querySelector('[data-view=before]').disabled=true;show('after');
</script></html>`;
}
