const { test, expect } = require('@playwright/test');

const ROOMS = ['12345', '67890'];

function parsePos(text) {
  const m = text.match(/pos:(-?\d+),(-?\d+)/);
  if (!m) throw new Error('No se pudo leer pos del diagnóstico: ' + text);
  return { x: Number(m[1]), y: Number(m[2]) };
}

async function waitForLiveGame(page, room, debug) {
  await page.goto(`https://misael546.github.io/JuegoWeb/neoncore/${room}/?ci=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await expect(page.locator('#neonDiag')).toContainText('DIAG', { timeout: 30000 });
  let started = false;
  for (let attempt = 1; attempt <= 2 && !started; attempt++) {
    try {
      await expect.poll(async () => (await page.locator('#neonDiag').innerText()), {
        timeout: 35000,
        intervals: [500, 1000, 2000]
      }).toMatch(/game:true/);
      started = true;
    } catch (e) {
      if (attempt === 2) {
        const diag = await page.locator('#neonDiag').innerText();
        throw new Error('Game no inició en sala '+room+'\\n'+diag+'\\nPage errors: '+(debug.errors.join(' | ')||'none')+'\\nWebSockets: '+(debug.wsEvents.join(' | ')||'NONE'));
      }
      await page.reload({waitUntil:'domcontentloaded', timeout:45000});
    }
  }

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

    await waitForLiveGame(page, room, {errors,wsEvents});

    const joy = page.locator('#moveJoy');
    const box = await joy.boundingBox();
    expect(box).not.toBeNull();

    const before = parsePos(await page.locator('#neonDiag').innerText());
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + Math.min(55, box.width * 0.45), cy, { steps: 12 });
    await page.waitForTimeout(2200);
    await page.mouse.up();

    await expect.poll(async () => parsePos(await page.locator('#neonDiag').innerText()), {
      timeout: 5000,
      intervals: [250, 500]
    }).not.toEqual(before);

    const after = parsePos(await page.locator('#neonDiag').innerText());
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(5);

    const afterMoveDiag = await page.locator('#neonDiag').innerText();
    const afterMove = parsePos(afterMoveDiag);
    expect(Math.hypot(afterMove.x - 3000, afterMove.y - 2200)).toBeGreaterThan(340);

    const ammoBefore = Number((await page.locator('#ammo').innerText()).trim());
    const fireBox = await page.locator('#fire').boundingBox();
    expect(fireBox).not.toBeNull();
    await page.mouse.move(fireBox.x + fireBox.width/2, fireBox.y + fireBox.height/2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const ammoAfter = Number((await page.locator('#ammo').innerText()).trim());
    expect(ammoAfter).toBeLessThan(ammoBefore);

    const finalDiag = await page.locator('#neonDiag').innerText();
    expect(finalDiag).toContain('input:0.00,0.00');

    if (errors.length) {
      throw new Error('Errores detectados en navegador:\n' + errors.join('\n'));
    }
  });
}


for (const room of ROOMS) {
  test(`sala ${room}: salir y volver a entrar reconecta`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
    });

    await waitForLiveGame(page, room, {errors,wsEvents:[]});

    await page.goto('https://misael546.github.io/JuegoWeb/neoncore/?rejoinci=' + Date.now(), {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    await expect(page.locator('.room[data-room="' + room + '"]')).toBeVisible({timeout:15000});
    await page.locator('.room[data-room="' + room + '"]').click();

    await expect.poll(async () => (await page.locator('#neonDiag').innerText()), {
      timeout: 45000,
      intervals: [500, 1000, 2000]
    }).toMatch(/game:true/);

    const diag = await page.locator('#neonDiag').innerText();
    expect(diag).toContain('ws:1');
    expect(diag).toContain('room:' + room);
    if(errors.length) throw new Error('Errores durante reingreso:\n' + errors.join('\n'));
  });
}


test('menu público táctil: abrir sala desde el selector', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  await page.goto('https://misael546.github.io/JuegoWeb/neoncore/?menuCI=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await expect(page.locator('.room[data-room="12345"]')).toBeVisible({timeout:15000});
  await page.locator('.room[data-room="12345"]').dispatchEvent('pointerup', {
    pointerType: 'touch'
  });

  await expect.poll(async () => page.url(), {
    timeout: 15000,
    intervals: [250, 500]
  }).toContain('/neoncore/12345/');

  await context.close();
});


test('menu principal: nombre y entrada a sala', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  await page.goto('https://misael546.github.io/JuegoWeb/?mainCI=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await expect(page.locator('#username')).toBeVisible({timeout:15000});
  await expect(page.locator('.room[data-room="12345"]')).toHaveClass(/disabled/);

  await page.locator('#username').fill('PruebaNeon');
  await expect(page.locator('.room[data-room="12345"]')).not.toHaveClass(/disabled/);

  await page.locator('#quickPlay').click();

  await expect.poll(async () => page.url(), {
    timeout: 15000,
    intervals: [250, 500]
  }).toContain('/neoncore/12345/');

  await context.close();
});

test('mobile emulation: interfaz táctil y controles visibles', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
  });

  await page.goto('https://misael546.github.io/JuegoWeb/neoncore/12345/?mobileci=' + Date.now(), {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await expect(page.locator('#neonDiag')).toContainText('DIAG', { timeout: 30000 });
  await expect.poll(async () => page.locator('#neonDiag').innerText(), {
    timeout: 15000,
    intervals: [500, 1000]
  }).toMatch(/game:true/);

  await expect(page.locator('#moveJoy')).toBeVisible();
  await expect(page.locator('#fire')).toBeVisible();

  const body = await page.locator('body').evaluate(el => ({
    width: el.clientWidth,
    height: el.clientHeight,
    scrollWidth: el.scrollWidth,
    scrollHeight: el.scrollHeight
  }));
  expect(body.scrollWidth).toBeLessThanOrEqual(body.width + 2);
  expect(body.scrollHeight).toBeLessThanOrEqual(body.height + 2);

  if (errors.length) {
    throw new Error('Errores mobile: ' + errors.join(' | '));
  }
  await context.close();
});
