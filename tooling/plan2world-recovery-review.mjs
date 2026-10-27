/** Local source confirmation page. No provider, network request or geometry write.
 * A downloaded answer must be passed to a NEW CLI execution and strict checks.
 * @param {any} request @param {string} sourceDataUrl */
export function recoveryReviewPage(request, sourceDataUrl) {
  const esc = (/** @type {string} */ x) => x.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c] ?? c);
  const data = JSON.stringify(request).replace(/</g, '\\u003c');
  const [left, top, right, bottom] = request.contextBox;
  const labels = { 'confirm-aperture-host': '洞口两端正确，确认这是一个真实洞口', 'revise-local-source': '需要重新标注这一区域', 'unconfirmed': '无法判断，保留待确认' };
  const question = request.phase === 'opening-hosts' ? '图中这两个端点确实是门洞或窗洞的两端吗？'
    : request.issue.code === 'ambiguous-wall-overlap' ? '这些线是否属于同一面墙？需要更正时请标出真实端点。' : '能否从原图确认这一区域的真实轮廓？';
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>确认局部图纸证据</title>
<style>body{max-width:1180px;margin:24px auto;padding:0 16px;font:16px/1.6 system-ui;color:#203047;background:#f3f6f8}figure{margin:16px 0;padding:12px;background:white}svg{display:block;width:100%;max-height:600px;touch-action:manipulation}img{display:block;max-width:100%;height:auto;max-height:440px}label{display:block;margin:10px 0}textarea{width:100%;min-height:90px;box-sizing:border-box}button,select{font:inherit;padding:8px 12px;margin:8px 8px 8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}#error{color:#a43020}fieldset{min-width:0;border:1px solid #ccd6df}a{overflow-wrap:anywhere}[hidden]{display:none!important}</style>
<h1>确认局部图纸证据</h1><p>请结合全图和周边空间判断。无法确认时可直接保留待确认。这里的回答只会下载为文件，经过重新校验后才可能生成工程。</p>
<details><summary>查看完整原图</summary><figure><img src="${esc(sourceDataUrl)}" alt="完整原图"></figure></details>
<figure><svg id="context" xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${right-left} ${bottom-top}" aria-label="原图局部与待确认的端点"><image width="${request.source.width}" height="${request.source.height}" href="${esc(sourceDataUrl)}"/><g id="marks"/></svg><figcaption>橙色为当前洞口端点。重新标注时可在图上按顺序点选，坐标始终对应原图。</figcaption></figure>
<form id="review"><fieldset><legend>${question}</legend>${request.choices.map((/** @type {keyof labels} */ choice) => `<label><input type="radio" name="choice" value="${choice}"> ${labels[choice]}</label>`).join('')}</fieldset>
<div id="annotate" hidden><label>正在标注 <select id="target">${request.localObservations.map((/** @type {any} */ item) => `<option value="${esc(item.path)}">${esc(item.value.label ?? item.path)}</option>`).join('')}</select></label><p id="hint"></p><button type="button" id="clear">清除这一区域的点</button><p id="point-count"></p><label>门的开法 <select id="operation"><option value="keep">保留当前记录</option><option value="unknown">无法确认开法</option><option value="single">单扇平开</option><option value="double">双扇平开</option><option value="sliding">移门</option><option value="opening">无门扇通口</option></select></label></div>
<label>原图中支持这个判断的线索<textarea id="evidence" required placeholder="例如：两端门框、相邻墙线和开启弧的关系；或说明为什么无法确认。"></textarea></label>
<p id="error" role="alert"></p><button type="submit">下载确认结果</button></form><p>轮廓标注仅支持连续墙边。包含通口、栏杆等不同边界时，请保留待确认，使用完整局部源标注流程。</p>
<details><summary>查看问题记录</summary><pre>${esc(request.issue.message)}</pre></details>
<script type="module">
const request=${data};
const form=document.querySelector('#review'),svg=document.querySelector('#context'),marks=document.querySelector('#marks'),target=document.querySelector('#target'),error=document.querySelector('#error');
const edits=new Map(),operations=new Map();
const selected=()=>form.querySelector('input[name=choice]:checked')?.value;
const item=()=>request.localObservations.find(x=>x.path===target.value);
function circle(p,color){const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',Math.max(1,(request.contextBox[2]-request.contextBox[0])/150));c.setAttribute('fill',color);marks.append(c);}
function line(a,b,c,color){if(!a||!b)return;const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d','M '+a.x+' '+a.y+(c?' Q '+c.x+' '+c.y:' L')+' '+b.x+' '+b.y);shape.setAttribute('fill','none');shape.setAttribute('stroke',color);shape.setAttribute('stroke-width',Math.max(1,(request.contextBox[2]-request.contextBox[0])/350));marks.append(shape);}
function refresh(){
 document.querySelector('#annotate').hidden=selected()!=='revise-local-source';marks.replaceChildren();
 for(const {value}of request.localObservations){if(value.start&&value.end)line(value.start,value.end,value.curvePoint,'#e862b0');if(Array.isArray(value.boundary))value.boundary.forEach((b,i)=>line(b.point,value.boundary[(i+1)%value.boundary.length].point,b.curvePoint,'#e862b0'));}
 for(const c of request.apertureHostCandidates){circle(c.start,'#f67c25');circle(c.end,'#f67c25');}
 const x=item(),points=edits.get(target.value)||[];points.forEach(p=>circle(p,'#21b9f1'));
 document.querySelector('#point-count').textContent='已选 '+points.length+' 个点';
 document.querySelector('#hint').textContent=x?.path.startsWith('functionalZones')?'按顺序点选轮廓拐角，至少三个点；保留原来的功能点。':'点选洞口或墙线的两个端点。';
 document.querySelector('#operation').value=operations.get(target.value)||'keep';
}
form.addEventListener('change',refresh);target.addEventListener('change',refresh);
document.querySelector('#operation').addEventListener('change',e=>operations.set(target.value,e.target.value));
document.querySelector('#clear').onclick=()=>{edits.delete(target.value);refresh();};
svg.addEventListener('click',e=>{if(selected()!=='revise-local-source')return;const x=item();if(!x)return;const v=svg.createSVGPoint();v.x=e.clientX;v.y=e.clientY;const p=v.matrixTransform(svg.getScreenCTM().inverse()),points=edits.get(x.path)||[];if(!x.path.startsWith('functionalZones')&&points.length>=2)return;points.push({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100});edits.set(x.path,points);refresh();});
form.onsubmit=e=>{
 e.preventDefault();error.textContent='';const choice=selected(),evidence=document.querySelector('#evidence').value.trim();
 if(!choice||!evidence){error.textContent='请选择一种判断并填写原图线索。';return;}
 const answer={schemaVersion:'source-architecture-review-decision-v1',requestId:request.requestId,choice,evidence};
 if(choice==='revise-local-source'){
  answer.replacements=[];
  for(const [path,points]of edits){const original=request.localObservations.find(x=>x.path===path),value=structuredClone(original.value);
   if(path.startsWith('openings')){
    if(points.length!==2){error.textContent='洞口需要两个端点。';return;}value.endpoints=points;const op=operations.get(path)||'keep';
    if(op==='unknown'){delete value.doorType;delete value.typeEvidence;}else if(op!=='keep'){if(value.kind!=='door'){error.textContent='窗洞不能改为门。';return;}value.doorType=op;value.typeEvidence=evidence;}
   }else if(path.startsWith('walls')){
    if(points.length!==2||value.curvePoint){error.textContent='直墙需要两个端点；弯曲墙请使用完整局部源标注。';return;}value.start=points[0];value.end=points[1];
   }else if(path.startsWith('functionalZones')){
    if(points.length<3||!Array.isArray(value.boundary)||value.boundary.some(b=>b.kind!=='wall'||b.curvePoint)){error.textContent='此处需要完整局部源标注，请选择保留待确认。';return;}
    value.boundary=points.map(point=>({point,kind:'wall',evidence}));
   }else{error.textContent='此类问题需要完整局部源标注。';return;}
   value.evidence=evidence;value.decisionBasis=evidence;answer.replacements.push({path,value});
  }
  if(!answer.replacements.length){error.textContent='请先在原图上标出要修订的端点或轮廓。';return;}
 }
 const url=URL.createObjectURL(new Blob([JSON.stringify(answer,null,2)+'\\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='source-review-decision.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};refresh();
</script></html>\n`;
}
