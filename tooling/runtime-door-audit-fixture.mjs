import { runtimeWalkthroughProject } from './runtime-walkthrough-fixture.mjs';

/** Deliberately blocked motion plus explicit unsupported/leafless semantics.
 * Generated only into validation output; never used as a real-image answer. */
export async function runtimeDoorAuditProject() {
  const project=await runtimeWalkthroughProject(),ground=project.floors[0],upper=project.floors[1];
  ground.walls.push({id:'slide-travel-blocker',start:{x:430,y:300},end:{x:430,y:500},height:300,thickness:20,color:'#ccc'});
  for(const [id,wallId,type] of [['unsupported-fold','upper-w0','bifold'],['unsupported-overhead','upper-w3','garage'],['leafless','upper-w2','opening']]) {
    upper.doors.push({id,wallId,position:.5,width:100,height:220,type,swingDirection:'left',flipSide:false});
  }
  return project;
}
