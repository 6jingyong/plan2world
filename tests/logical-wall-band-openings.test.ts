import {expect,it} from 'vitest';
import {buildBareHouse} from '$lib/plan2world/bareHouse';
import {deriveSourceOpenings} from '$lib/plan2world/sourceOpenings';

const p=(x:number,y:number)=>({x,y});
function fixture(){
 const house=buildBareHouse({schemaVersion:'source-wall-trace-v1',walls:[{start:p(20,30),end:p(220,30),thicknessPx:40}]});
 const opening={id:'window',kind:'window',endpoints:[p(70,43),p(130,43)],evidence:'Observed within the explicit solid envelope.'};
 return {house,opening};
}
it('contains a whole parallel window in an explicit finite wall band without changing observed width',()=>{
 const {house,opening}=fixture(),raw=JSON.stringify({house,opening});
 const result=deriveSourceOpenings({cmPerPixel:2,bareHouse:house,openings:[opening]});
 expect(result.windows).toMatchObject([{id:'window',width:expect.closeTo(120,9),position:.4}]);
 expect(result.sourceIntervals[0]).toMatchObject({hostResolution:'contained-logical-wall-band',projectionDistancesPx:[13,13]});
 expect(JSON.stringify({house,opening})).toBe(raw);
});
it.each(['past-end','outside-band','oblique','air','no-envelope','explicit-tolerance','door'])('retains %s as unresolved instead of extending a host or widening tolerance',mode=>{
 const {house,opening}=fixture();
 if(mode==='past-end')opening.endpoints=[p(210,43),p(230,43)];
 if(mode==='outside-band')opening.endpoints=[p(70,51),p(130,51)];
 if(mode==='oblique')opening.endpoints[1].y++;
 if(mode==='air')house.walls[0].boundaryType='air';
 if(mode==='no-envelope')delete house.walls[0].thicknessPx;
 if(mode==='door')opening.kind='door';
 const r=deriveSourceOpenings({cmPerPixel:2,bareHouse:house,openings:[opening],...(mode==='explicit-tolerance'?{maxProjectionDistancePx:3}:{})});
 expect(r.windows).toEqual([]);expect(r.doors).toEqual([]);expect(r.warnings.length).toBeGreaterThan(0);
});
it('does not choose between two containing bands even when residuals differ',()=>{
 const {house,opening}=fixture();house.walls.push({...house.walls[0],id:'other',start:p(20,55),end:p(220,55)});
 const r=deriveSourceOpenings({cmPerPixel:1,bareHouse:house,openings:[opening]});
 expect(r.windows).toEqual([]);expect(r.warnings[0].message).toContain('ambiguous');
});
it('preserves width across a split of one continuous containing baseline',()=>{
 const {opening}=fixture(),house=buildBareHouse({schemaVersion:'source-wall-trace-v1',walls:[
  {start:p(20,30),end:p(220,30),thicknessPx:40},{start:p(100,30),end:p(100,200)},
 ]});
 const r=deriveSourceOpenings({cmPerPixel:2,bareHouse:house,openings:[opening],allowWindowHostChains:true});
 expect(r.windows).toHaveLength(2);expect(r.windows.reduce((s,w)=>s+w.width,0)).toBeCloseTo(120);
 expect(r.sourceIntervals[0].hostResolution).toBe('continuous-logical-wall-band-chain');
});
it('rejects a containing single host when another containing baseline has been split',()=>{
 const {opening}=fixture(),house=buildBareHouse({schemaVersion:'source-wall-trace-v1',walls:[
  {start:p(20,30),end:p(220,30),thicknessPx:40},{start:p(100,30),end:p(100,45)},
  {start:p(20,55),end:p(220,55),thicknessPx:40},
 ]});
 const r=deriveSourceOpenings({cmPerPixel:2,bareHouse:house,openings:[opening],allowWindowHostChains:true});
 expect(r.windows).toEqual([]);expect(r.warnings[0].message).toContain('ambiguous');
});
