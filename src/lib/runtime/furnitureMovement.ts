import type {FurnitureWallMount} from '../models/types';
import type {furnitureWallFrame} from '../utils/furniturePlacement';
import type {RuntimeFurnitureEntity} from './types';

export function runtimeWallMovement(frame:ReturnType<typeof furnitureWallFrame>,mount:FurnitureWallMount,elevationCm:number):RuntimeFurnitureEntity['movement'] {
  return {kind:'wall',wallId:mount.wallId,side:mount.side,
    blocked:frame.blocked.map(opening=>({along:[opening.along[0]*.01,opening.along[1]*.01],bottom:[opening.bottom[0]*.01,opening.bottom[1]*.01]})),
    origin:[frame.origin.x*.01,elevationCm*.01,frame.origin.y*.01],tangent:[frame.tangent.x,0,frame.tangent.y],
    along:[frame.along[0]*.01,frame.along[1]*.01],bottom:[frame.bottom[0]*.01,frame.bottom[1]*.01]};
}
