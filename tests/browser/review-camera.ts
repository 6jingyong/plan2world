import { Matrix4, Vector3 } from 'three';
import { expect, type Page } from '@playwright/test';

/** Observe the real WebGL camera, without adding production debug hooks. */
export async function observeReviewCamera(page: Page) {
  await page.addInitScript(() => {
    const audit = { viewMatrix: null, projectionMatrix: null };
    (window as any).__reviewCamera = audit;
    const getContext = HTMLCanvasElement.prototype.getContext, seen = new WeakSet();
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: any[]) {
      const gl = (getContext as any).apply(this, args);
      if (!gl || !String(args[0]).startsWith('webgl') || seen.has(gl)) return gl;
      seen.add(gl);
      const names = new Map(), locate = gl.getUniformLocation.bind(gl), matrix = gl.uniformMatrix4fv.bind(gl);
      gl.getUniformLocation = (program: WebGLProgram, name: string) => {
        const location = locate(program,name); if (location) names.set(location,name); return location;
      };
      gl.uniformMatrix4fv = (location: WebGLUniformLocation, transpose: boolean, values: Float32Array, ...rest: any[]) => {
        const name = names.get(location);
        if (name === 'viewMatrix' || name === 'projectionMatrix') (audit as any)[name] = Array.from(values);
        return matrix(location,transpose,values,...rest);
      };
      return gl;
    } as typeof getContext;
  });
}

export async function reviewPoint(page: Page, point: {x:number;y:number;z:number}) {
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__reviewCamera?.viewMatrix && (window as any).__reviewCamera?.projectionMatrix))).toBe(true);
  const matrices = await page.evaluate(() => (window as any).__reviewCamera);
  const p = new Vector3(point.x,point.y,point.z).applyMatrix4(new Matrix4().fromArray(matrices.viewMatrix)).applyMatrix4(new Matrix4().fromArray(matrices.projectionMatrix));
  const canvas = page.getByRole('region',{name:'3D floor plan viewer'}).locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  return {x:box.x+(p.x+1)*box.width/2,y:box.y+(1-p.y)*box.height/2};
}
