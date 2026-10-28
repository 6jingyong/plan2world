import type { Project } from '../models/types';

// Read-only authoring choices. Engines display these symbols; they never infer
// door mechanics, opening hosts or runtime geometry from them.
export function nativeOpeningCatalog() {
  const symbol = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">${body}</svg>`;
  return [
    ...([['wood','Wood','#99704d'],['glass','Glass','#8abac5'],['steel','Metal / security','#83918c']] as const).map(([material,label,color]) => ({
      kind: 'door', material, label, category: 'Materials', description: 'Keeps the opening and current door movement.',
      symbolSvg: symbol(`<rect x="17" y="5" width="38" height="62" rx="3" fill="${color}"/><circle cx="46" cy="37" r="2.5" fill="#fffdf5"/>`),
    })),
    ...([['standard','Standard'],['fixed','Fixed pane'],['casement','Casement'],['sliding','Sliding'],['bay','Bay']] as const).map(([windowType,label]) => ({
      kind:'window', windowType, label, category: 'Window types', description:'Keeps the existing opening, dimensions and wall.',
      symbolSvg:symbol(`<rect x="6" y="12" width="60" height="48" fill="#b2d8df" stroke="#397b67" stroke-width="4"/>${windowType==='fixed'?'':`<path d="M36 14v44${windowType==='casement'?'M9 15l24 21L9 57':windowType==='bay'?'M20 14v44M52 14v44':''}" fill="none" stroke="#397b67" stroke-width="3"/>`}`),
    })),
  ];
}

export function nativeOpeningEditor(project: Project) {
  return project.floors.flatMap(f => [
    ...f.doors.filter(d => d.type !== 'opening').map(d => ({...d,kind:'door',floorId:f.id,material:d.material??'wood'})),
    ...f.windows.map(w => ({...w,kind:'window',floorId:f.id})),
  ]);
}
