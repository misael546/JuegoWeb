const { test, expect } = require('@playwright/test');

const ROOMS = ['12345', '67890'];

function parsePos(text) {
  const m = text.match(/pos:(-?\d+),(-?\d+)/);
  if (!m) throw new Error('No se pudo leer pos del diagnóstico: ' + text);
  return { x: Number(m[1]), y: Number(m[2]) };
}

async function waitForLiveGame(page, room) {
  await page.goto(`https://misael546.github.io/JuegoWeb/neoncore/${room}/?ci=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await expect(page.locator('#neonDiag')).toContainText('DIAG', { timeout: 30000 });
  await expect.poll(async () => (await page.locator('#neonDiag').innerText()), {
    timeout: 30000,
    intervals: [500, 1000]
  }).toMatch(/game:true/);

  const diag = await page.locator('#neonDiag').innerText();
  expect(diag).toContain('ws:1');
  expect(diag).toContain(`room:${room}`);
  expect(diag).toMatch(/mobs:[1-9]\d*/);
  expect(diag).toMatch(/walls:[1-9]\d*/);
}

for (const room of ROOMS) {
  test(`sala ${room}: conexión, movimiento y disparo`, async ({ page }) => {
    const errors = [];
    const wsEvents = [];
    page.on('websocket', ws => { wsEvents.push('created:'+ws.url()); ws.on('close', () => wsEvents.push('closed:'+ws.url())); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
    });
    page.on('requestfailed', req => {
      const url = req.url();
      if (!url.includes('favicon')) errors.push('REQUESTFAILED: ' + url + ' :: ' + (req.failure()?.errorText || 'unknown'));
    });

    await waitForLiveGame(page, room);

    const joy = page.locator('#moveJoy');
    const box = await joy.boundingBox();
    expect(box).not.toBeNull();

    const before = parsePos(await page.locator('#neonDiag').innerText());
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + Math.min(55, box.width * 0.45), cy, { steps: 12 });
    await page.waitForTimeout(900);
    await page.mouse.up();

    await expect.poll(async () => parsePos(await page.locator('#neonDiag').innerText()), {
      timeout: 5000,
      intervals: [250, 500]
    }).not.toEqual(before);

    const after = parsePos(await page.locator('#neonDiag').innerText());
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(5);

    const ammoBefore = Number((await page.locator('#ammo').innerText()).trim());
    await page.locator('#fire').click();
    await page.waitForTimeout(450);
    const ammoAfter = Number((await page.locator('#ammo').innerText()).trim());
    expect(ammoAfter).toBeLessThan(ammoBefore);

    const finalDiag = await page.locator('#neonDiag').innerText();
    expect(finalDiag).toContain('input:0.00,0.00');

    if (errors.length) {
      throw new Error('Errores detectados en navegador:\n' + errors.join('\n'));
    }
  });
}
