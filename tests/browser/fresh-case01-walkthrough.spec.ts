import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

const wallTrace = {
  "schemaVersion": "source-wall-trace-v1",
  "walls": [
    {"start":{"x":978,"y":179},"end":{"x":1110,"y":179}},
    {"start":{"x":770,"y":239},"end":{"x":978,"y":239}},
    {"start":{"x":770,"y":309},"end":{"x":1134,"y":309}},
    {"start":{"x":245,"y":341},"end":{"x":779,"y":341}},
    {"start":{"x":245,"y":499},"end":{"x":779,"y":499}},
    {"start":{"x":1065,"y":499},"end":{"x":1338,"y":499}},
    {"start":{"x":463,"y":567},"end":{"x":654,"y":567}},
    {"start":{"x":1065,"y":594},"end":{"x":1338,"y":594}},
    {"start":{"x":1065,"y":650},"end":{"x":1168,"y":650}},
    {"start":{"x":150,"y":660},"end":{"x":245,"y":660}},
    {"start":{"x":245,"y":806},"end":{"x":1065,"y":806}},
    {"start":{"x":1065,"y":816},"end":{"x":1338,"y":816}},
    {"start":{"x":150,"y":894},"end":{"x":463,"y":894}},
    {"start":{"x":654,"y":894},"end":{"x":1065,"y":894}},
    {"start":{"x":978,"y":179},"end":{"x":978,"y":309}},
    {"start":{"x":1110,"y":179},"end":{"x":1110,"y":309}},
    {"start":{"x":770,"y":239},"end":{"x":770,"y":309}},
    {"start":{"x":245,"y":341},"end":{"x":245,"y":806}},
    {"start":{"x":385,"y":341},"end":{"x":385,"y":499}},
    {"start":{"x":498,"y":341},"end":{"x":498,"y":499}},
    {"start":{"x":675,"y":341},"end":{"x":675,"y":499}},
    {"start":{"x":779,"y":309},"end":{"x":779,"y":499}},
    {"start":{"x":1134,"y":309},"end":{"x":1134,"y":499}},
    {"start":{"x":463,"y":567},"end":{"x":463,"y":894}},
    {"start":{"x":654,"y":567},"end":{"x":654,"y":894}},
    {"start":{"x":1065,"y":594},"end":{"x":1065,"y":894}},
    {"start":{"x":1168,"y":650},"end":{"x":1168,"y":816}},
    {"start":{"x":1338,"y":499},"end":{"x":1338,"y":816}},
    {"start":{"x":150,"y":660},"end":{"x":150,"y":894}}
  ],
  "doorGaps": []
} as const;
const annotation = {
  "schemaVersion": "source-annotation-v1",
  "scaleEvidence": {
    "kind": "measured_dimension",
    "realLengthCm": 780,
    "endpoints": [{"x": 635, "y": 930}, {"x": 1046, "y": 930}],
    "evidence": "Visible 7800 mm bottom dimension chain segment."
  },
  "openings": [
    {"kind":"door","endpoints":[{"x":300,"y":499},{"x":350,"y":499}],"evidence":"Visible bathroom doorway aperture and swing arc.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":410,"y":499},{"x":455,"y":499}],"evidence":"Visible doorway aperture from dressing/master zone.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":575,"y":499},{"x":630,"y":499}],"evidence":"Visible bedroom doorway aperture.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":700,"y":499},{"x":750,"y":499}],"evidence":"Visible bathroom doorway aperture.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":555,"y":567},{"x":610,"y":567}],"evidence":"Visible lower bedroom doorway aperture.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":1180,"y":499},{"x":1240,"y":499}],"evidence":"Main entrance doorway visible in the upper entry boundary.","doorType":"single","typeEvidence":"Single hinged entrance leaf arc."},
    {"kind":"door","endpoints":[{"x":1115,"y":594},{"x":1170,"y":594}],"evidence":"Visible doorway from entry hall into right bedroom zone.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":1168,"y":690},{"x":1168,"y":742}],"evidence":"Visible right bathroom doorway aperture.","doorType":"single","typeEvidence":"Single hinged leaf arc."},
    {"kind":"door","endpoints":[{"x":995,"y":309},{"x":1055,"y":309}],"evidence":"Visible kitchen opening toward dining area.","doorType":"sliding","typeEvidence":"Wide rectilinear kitchen opening with sliding-panel treatment."},
    {"kind":"window","endpoints":[{"x":260,"y":341},{"x":335,"y":341}],"evidence":"Exterior glazing on upper wall of left bathroom."},
    {"kind":"window","endpoints":[{"x":520,"y":341},{"x":620,"y":341}],"evidence":"Exterior glazing on upper wall of central bedroom."},
    {"kind":"window","endpoints":[{"x":700,"y":341},{"x":760,"y":341}],"evidence":"Exterior glazing on upper wall of public bathroom."},
    {"kind":"window","endpoints":[{"x":995,"y":179},{"x":1080,"y":179}],"evidence":"Kitchen exterior window on top wall."},
    {"kind":"window","endpoints":[{"x":790,"y":239},{"x":950,"y":239}],"evidence":"Sealed upper balcony exterior glazing."},
    {"kind":"window","endpoints":[{"x":245,"y":535},{"x":245,"y":620}],"evidence":"Master-bedroom exterior-side glazing."},
    {"kind":"window","endpoints":[{"x":270,"y":806},{"x":430,"y":806}],"evidence":"Master bedroom glazing toward sealed balcony."},
    {"kind":"window","endpoints":[{"x":490,"y":806},{"x":620,"y":806}],"evidence":"Bedroom glazing toward lower exterior/balcony edge."},
    {"kind":"window","endpoints":[{"x":700,"y":806},{"x":1000,"y":806}],"evidence":"Large living-room glazing toward sealed balcony."},
    {"kind":"window","endpoints":[{"x":170,"y":894},{"x":440,"y":894}],"evidence":"Sealed left balcony outer glazing."},
    {"kind":"window","endpoints":[{"x":150,"y":690},{"x":150,"y":860}],"evidence":"Sealed left balcony side glazing."},
    {"kind":"window","endpoints":[{"x":680,"y":894},{"x":1040,"y":894}],"evidence":"Sealed living-room balcony outer glazing."},
    {"kind":"window","endpoints":[{"x":1338,"y":650},{"x":1338,"y":790}],"evidence":"Right bedroom exterior glazing."},
    {"kind":"window","endpoints":[{"x":1190,"y":816},{"x":1310,"y":816}],"evidence":"Right bedroom lower bay/window glazing."}
  ],
  "furniture": [
    {"sourceCategory":"bed","position":{"x":350,"y":670}},
    {"sourceCategory":"bed","position":{"x":555,"y":720}},
    {"sourceCategory":"bed","position":{"x":560,"y":420}},
    {"sourceCategory":"bed","position":{"x":1240,"y":710}},
    {"sourceCategory":"sofa","position":{"x":850,"y":650}},
    {"sourceCategory":"coffee_table","position":{"x":940,"y":665}},
    {"sourceCategory":"dining_table","position":{"x":900,"y":405}},
    {"sourceCategory":"shoe_cabinet","position":{"x":1280,"y":545}},
    {"sourceCategory":"refrigerator","position":{"x":1080,"y":245}},
    {"sourceCategory":"toilet","position":{"x":275,"y":410}},
    {"sourceCategory":"bathtub","position":{"x":345,"y":425}},
    {"sourceCategory":"toilet","position":{"x":720,"y":420}},
    {"sourceCategory":"toilet","position":{"x":1120,"y":715}}
  ],
  "assumptions": [
    "Balcony exterior boundaries are treated as sealed glazing where visibly enclosed.",
    "Furniture extraction is intentionally limited to clearly identifiable major objects and sanitary fixtures."
  ]
} as const;

const requests: any[] = [];
let callCount = 0;
const provider = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); requests.push(body);
  const output = callCount++ % 2 === 0 ? wallTrace : annotation;
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }));
});

test.describe.configure({ timeout: 180_000 });
test.beforeAll(async () => { await new Promise<void>(resolve => provider.listen(4211, '127.0.0.1', resolve)); });
test.afterAll(async () => { provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); });

test('fresh case01 evidence reaches editable 3D home and walkthrough', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Generate from floor-plan image/ }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await page.getByLabel('Provider base URL', { exact: true }).fill('http://127.0.0.1:4211/v1');
  await page.getByLabel('OpenAI model', { exact: true }).fill('fresh-case01');
  await page.getByRole('button', { name: 'Save OpenAI settings', exact: true }).click();

  const input = page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1026;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await input.setInputFiles({ name: '01-1000028397.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.getByRole('button', { name: 'Generate reconstruction', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review reconstructed plan', exact: true })).toBeVisible();
  await expect(page.getByText('Reconstruction ready for review.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text).toContain('source-wall-trace-v1');
  expect(requests[1].input?.[0]?.content?.find((item: any) => item.type === 'input_text')?.text).toContain('BARE_HOUSE_JSON:');
  await expect(page.getByText('doors', { exact: true }).locator('..')).toContainText('9');
  await expect(page.getByText('windows', { exact: true }).locator('..')).toContainText('13');

  await page.getByRole('button', { name: 'Open editable home', exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?id=/);
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const canvas = page.getByRole('region', { name: '3D floor plan viewer' }).locator('canvas').first();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendered', 'true');
  const walkthrough = page.getByRole('button', { name: 'Enter Walkthrough Mode', exact: true });
  await expect(walkthrough).toBeVisible();
  await walkthrough.click();
  await expect(page.getByText('Walkthrough Controls', { exact: true })).toBeVisible();
  const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(500); await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(100);
  const after = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(after).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Exit Walkthrough Mode', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});