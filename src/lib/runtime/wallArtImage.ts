import { readProject } from '../utils/projectValidation';
import { webToNative } from '../utils/projectPackageBridge';
import { photoHeader } from '../utils/rasterHeader';
import { getFurnitureSize } from '../utils/furnitureCatalog';
import { compileWallDecorAsset } from './runtimeAssets';
import { compileAssetNormalization } from './assetNormalization';

export interface WallArtImageCommand {
  type:'wall-art-image'; floorId:string; id:string;
  /** Native UI decodes JPG/PNG and freezes an upright PNG preview before Apply. */
  image:{pngBase64:string;filename:string}|null;
}
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
const encode=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);};

/** Shared authoring transaction. Reuse immutable Project model attachments; no
 * machine-local path, image URL or presentation pixels enter runtime semantics. */
export async function applyWallArtImage(input:unknown,command:WallArtImageCommand,now=new Date()){
  const project=readProject(input),item=project.floors.find(f=>f.id===command.floorId)?.furniture.find(f=>f.id===command.id);
  if(!item||item.catalogId!=='wall_art'||!item.wallMount||item.locked)throw new Error('Choose an unlocked, wall-mounted artwork.');
  if(command.image===null)delete item.customModelId;
  else{
    const {pngBase64,filename}=command.image;
    if(typeof filename!=='string'||!filename.trim()||filename.length>256)throw new Error('Use an image filename up to 256 characters.');
    if(typeof pngBase64!=='string'||!pngBase64.length||pngBase64.length%4||pngBase64.length>Math.ceil(8*1024*1024/3)*4||/[^A-Za-z0-9+/]/.test(pngBase64.replace(/={1,2}$/, '')))throw new Error('Choose a PNG preview up to 8 MiB.');
    const bytes=Uint8Array.from(atob(pngBase64),c=>c.charCodeAt(0)),info=photoHeader(bytes);
    if(!info||info.mime!=='image/png'||info.width<1||info.height<1||info.width>4096||info.height>4096||info.width*info.height>16_000_000)throw new Error('Choose a decoded PNG preview up to 4096 pixels per side and 16 million pixels.');
    const size=getFurnitureSize(item);
    const glb=compileWallDecorAsset('wall_art',{bytes,...info,frameAspect:size.width/size.height});
    compileAssetNormalization(glb);
    const sha256=await hash(glb),id=`art-${sha256}`,assetName=`${id}.glb`,data=encode(glb);
    let model=project.customModels?.find(m=>m.id===id);
    if(model){if(project.projectPackage?.assets[`assets/${model.assetName}`]!==data)throw new Error('The retained artwork attachment is missing or damaged.');}
    else{
      if((project.customModels?.length??0)>=64)throw new Error('This Project already has 64 model definitions.');
      if(!project.projectPackage){const {plan,mapping}=webToNative(project,undefined);project.projectPackage={version:1,furnitureCategoriesVersion:1,native:plan,mapping,assets:{}};}
      const assets=project.projectPackage.assets;
      if(Object.keys(assets).length>=507||Object.values(assets).reduce((n,v)=>n+v.length*.75,glb.length)>64*1024*1024)throw new Error('This image would exceed the Project attachment budget.');
      if(assets[`assets/${assetName}`]!==undefined&&assets[`assets/${assetName}`]!==data)throw new Error('An unrelated attachment already uses this name.');
      assets[`assets/${assetName}`]=data;
      // Store unscaled authored sizes; the selected piece retains every pose,
      // dimension and mirror/scale setting. Catalog reuse follows wall mounting.
      model={id,name:filename,assetName,sourceFilename:filename,sha256,byteLength:glb.length,purpose:'wall-art-image',width:size.width/Math.abs(item.scale.x),depth:size.depth/Math.abs(item.scale.y),height:size.height/Math.abs(item.scale.z)};
      project.customModels=[...(project.customModels??[]),model];
    }
    item.width=size.width/Math.abs(item.scale.x);item.depth=size.depth/Math.abs(item.scale.y);item.height=size.height/Math.abs(item.scale.z);
    item.customModelId=model.id;
  }
  project.updatedAt=now;
  return{project:readProject(project),selectedId:item.id,updateKind:'furniture' as const};
}
