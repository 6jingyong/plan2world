import { deflateSync } from 'node:zlib';

/** Deterministic RGBA PNG encoder for the offline authoring process.
 * @param {{width:number,height:number,data:Uint8Array}} raster */
export function encodeRgbaPng({width,height,data}) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>24_000_000||data.length!==width*height*4) throw new Error('Image preparation PNG dimensions are invalid.');
  const crc=(/** @type {Uint8Array} */ bytes)=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;};
  const chunk=(/** @type {string} */ type,/** @type {Buffer} */ body)=>{const content=Buffer.concat([Buffer.from(type),body]),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(body.length);sum.writeUInt32BE(crc(content));return Buffer.concat([length,content,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const scan=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++)scan.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
