/* Full handbook mobile QA. Mutations are confined to a fresh temporary browser
 * context; production files are read only. All HTTP(S) is blocked. No external
 * navigation, purchases, messages, or real repayment are performed. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.argv[2]) throw Error('Usage: check_features.cjs WORKBENCH [--engine webkit|chromium]');
const root = path.resolve(process.argv[2]);
const qa = path.join(root, 'qa'); fs.mkdirSync(qa, {recursive:true});
const profile = JSON.parse(fs.readFileSync(path.join(root, 'destination-profile.json')));
const dayCount = profile.itinerary.length, testDay = Math.min(2, dayCount - 1);
const primaryCurrency = profile.currency || 'USD';
const alternateCurrency = (profile.currencies || ['USD', 'EUR']).find(c => c !== primaryCurrency);
const searchTerm = profile.places[0].display_name;
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const engine = arg('--engine', 'webkit');
const selectedTests = (arg('--only', '') || '').split(',').filter(Boolean);
const receipt = JSON.parse(fs.readFileSync(path.join(root, 'offline-export.json'), 'utf8'));
const overrideFile = arg('--file', null);
const file = overrideFile ? path.resolve(overrideFile) : path.resolve(root, receipt.file);
const prefix = arg('--prefix', `mobile-features-${engine}`);
const reportPath = path.join(qa, `${prefix}.json`);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const result = {
  started_at: new Date().toISOString(), file, sha256: hash(fs.readFileSync(file)), engine,
  method: 'Fresh browser context; 390×844 mobile layout, touch, iPhone Safari UA; ordinary file URL; every HTTP(S) request aborted. WebKit offline=true deliberately not used.',
  limitation: 'Automated desktop-engine mobile emulation, not a physical iPhone, Files Quick Look, real photo-picker/share-sheet, or durable storage after browser data removal.',
  selected_tests: selectedTests, status: 'running', checks: [], page_errors: [], blocked_requests: [], dialogs: [], unexpected_popups: [], screenshots: []
};
const save = () => fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
const ledgerKey = profile.handbook_id + '-shared-ledger-local-v1';
const fixturePNG = path.join(qa, `${prefix}-upload.png`);
// Test fixture only; an opaque 1×1 PNG gives the upload/IndexedDB path valid bytes.
fs.writeFileSync(fixturePNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+WQAAAAASUVORK5CYII=', 'base64'));
const fixturePDF = path.join(qa, `${prefix}-ticket.pdf`);
const pdfObjects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const stream = 'BT /F1 16 Tf 30 150 Td (QA local ticket - no reservation) Tj ET';
pdfObjects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
let pdf = '%PDF-1.4\n', offsets = [0];
for (let i = 0; i < pdfObjects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${pdfObjects[i]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n` + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(fixturePDF, pdf);

(async () => {
  assert(['webkit', 'chromium'].includes(engine), 'engine must be webkit or chromium');
  if (!overrideFile) assert(result.sha256 === receipt.sha256, 'offline-export.json hash does not match delivered HTML');
  const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE }));
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua, acceptDownloads: true });
    await context.route(/^https?:\/\//, async route => { result.blocked_requests.push({ url: route.request().url(), kind: route.request().resourceType() }); await route.abort('internetdisconnected'); });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', e => { result.page_errors.push(e.message); save(); });
    page.on('popup', async popup => { result.unexpected_popups.push(popup.url()); await popup.close(); });
    page.on('dialog', async dialog => {
      result.dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (dialog.type() === 'confirm' && dialog.message().includes('QA乙') && dialog.message().includes('QA甲') && dialog.message().includes('还款')) await dialog.accept();
      else await dialog.dismiss();
    });
    const settleUI = async () => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
    const reload = async () => { await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 30000 }); await page.waitForFunction(count => window.BALI_ITINERARY?.length === count && !!document.querySelector('.trip-mode-launch'), dayCount); await settleUI(); };
    const shot = async name => { const out = path.join(qa, `${prefix}-${name}.png`); await page.waitForTimeout(450); await page.screenshot({ path: out }); result.screenshots.push(out); return out; };
    const clickVisible = async selector => { const loc = page.locator(selector).filter({ visible: true }).first(); await loc.waitFor({ state: 'visible' }); await loc.click(); };
    const openAncestors = async locator => { const details = await locator.locator('xpath=ancestor::details[not(@open)]').all(); for (const d of details.reverse()) await d.locator(':scope > summary').click(); };
    const navigate = async id => {
      await clickVisible('.atlas-menu-toggle');
      await page.locator(`.atlas-sidebar a[href="#${id}"]`).filter({ visible: true }).first().click();
      await page.waitForFunction(() => !document.body.classList.contains('atlas-menu-open'));
      await page.locator('#' + id).scrollIntoViewIfNeeded(); await settleUI();
    };
    const openTrip = async index => {
      if (!await page.locator('.trip-mode-overlay').count()) await clickVisible('.trip-mode-launch, .atlas-trip-open, [data-complete-trip]');
      await page.locator('.trip-mode-overlay').waitFor({ state: 'visible' });
      await page.locator('.trip-mode-day').nth(index).click();
      await page.locator('button[data-trip-view="itinerary"]').click(); await settleUI();
    };
    const closeTrip = async () => { await page.locator('.trip-mode-close').click(); await page.locator('.trip-mode-overlay').waitFor({ state: 'detached' }); };
    const openLedger = async () => { await page.locator('[data-dock="ledger"]').click(); await page.locator('#trip-page-expense .expense-app').waitFor({state:'visible'}); await page.waitForFunction(() => document.querySelector('.ledger-sync [data-sync]')?.textContent.includes('本机')); };
    const readLedger = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), ledgerKey);
    const run = async (id, fn) => {
      if (selectedTests.length && !selectedTests.includes(id)) return;
      const row = { id, status: 'running', started_at: new Date().toISOString() }; result.checks.push(row); save();
      try { await reload(); row.measurements = await fn(); row.status = 'passed'; }
      catch (e) { row.status = 'failed'; row.error = e.stack; try { row.screenshot = await shot('FAIL-' + id); row.visible_text = (await page.locator('body').innerText()).slice(-9000); } catch {} }
      row.finished_at = new Date().toISOString(); save(); console.log(id + ': ' + row.status);
    };

    await run('startup_navigation_search', async () => {
      const initial = await page.evaluate(key => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, days: window.BALI_ITINERARY.length, ua: navigator.userAgent, initial_storage: localStorage.getItem(key) }), ledgerKey);
      assert(initial.scroll <= initial.width, 'initial horizontal overflow');
      assert(initial.initial_storage === null, 'context did not begin with a clean ledger');
      await shot('cover');
      await navigate('route');
      assert(page.url().endsWith('#route'), 'directory did not navigate to route');
      const fold = page.locator('#route details.day').first(); await fold.locator(':scope > summary').click(); assert(await fold.evaluate(e => e.open), 'day accordion did not open');
      await fold.locator(':scope > summary').click(); assert(!await fold.evaluate(e => e.open), 'day accordion did not close');
      await clickVisible('.atlas-search-trigger'); await page.locator('dialog.atlas-search').waitFor({ state: 'visible' });
      await page.locator('.atlas-search input').fill(searchTerm);
      const hits = page.locator('.atlas-search-results a'); await hits.first().waitFor({ state: 'visible' });
      const hit = await hits.first().innerText(); assert(hit.includes(searchTerm) || await hits.count() > 0, 'search did not produce results');
      await shot('search'); await hits.first().click();
      assert(!await page.locator('dialog.atlas-search').evaluate(e => e.open), 'search did not close on selection');
      return { initial, selected_hit: hit, directory: true, disclosure: true, search: true };
    });
    await run('trip_all_days', async () => {
      await openTrip(0); assert(await page.locator('.trip-mode-day').count() === dayCount, 'trip mode day count');
      const expected = await page.evaluate(() => window.BALI_ITINERARY.map(d => ({ date: d.date, theme: d.theme, stops:d.stops.length })));
      const visited = [];
      for (let i = 0; i < dayCount; i++) {
        await page.locator('.trip-mode-day').nth(i).click();
        await page.locator('button[data-trip-view="itinerary"]').click();
        const date = (await page.locator('.trip-mode-intro > small').innerText()).trim();
        const title = (await page.locator('.trip-mode-intro h2').innerText()).trim();
        assert(date === expected[i].date && title === expected[i].theme, `day ${i + 1} content stale`);
        const count = await page.locator('#trip-page-itinerary .trip-stop').count();
        assert(count === expected[i].stops, `day ${i + 1} stop count mismatch`);
        visited.push({ day: i + 1, date, title, stops: count });
      }
      await shot('trip-last-day'); await closeTrip(); return { visited, close: true };
    });
    await run('map_fit_zoom_close', async () => {
      await openTrip(testDay); await page.locator('button[data-trip-view="map"]').click();
      await page.locator('.trip-mode-overlay a[href="#offline-image-viewer"]').first().click();
      const viewer = page.locator('#offline-image-viewer'); await viewer.waitFor({ state: 'visible' });
      await page.waitForFunction(() => { const i = document.querySelector('#offline-image-viewer img'); return i?.complete && i.naturalWidth > 0; });
      const measure = () => viewer.locator('img').evaluate(e => ({ width: e.getBoundingClientRect().width, natural: e.naturalWidth, height: e.naturalHeight }));
      await viewer.locator('[data-map-zoom="1"]').click(); const fit = await measure();
      await viewer.locator('[data-map-zoom="2"]').click(); const two = await measure();
      await viewer.locator('[data-map-zoom="3"]').click(); const three = await measure();
      assert(two.width > fit.width * 1.8 && three.width > two.width * 1.3, 'map zoom did not scale');
      await shot('map-zoom3');
      await viewer.locator('[data-map-zoom="1"]').click(); const restored = await measure();
      assert(Math.abs(restored.width - fit.width) <= 2, 'map fit did not restore');
      await viewer.locator('[data-map-close]').click(); assert(!await viewer.isVisible(), 'map viewer did not close');
      await closeTrip(); return { fit, two, three, restored, closed: true };
    });
    await run('ledger_members_expense_split_edit_reload_settle', async () => {
      await openLedger();
      const currency = page.locator('.expense-form [name="currency"]');
      assert(await currency.inputValue() === primaryCurrency, 'fresh ledger currency must default to configured currency');
      const currencies = await currency.locator('option').evaluateAll(es => es.map(e => e.value));
      assert(currencies.includes(primaryCurrency) && currencies.includes(alternateCurrency), 'configured currencies must be available');
      await currency.selectOption(alternateCurrency); assert(await currency.inputValue() === alternateCurrency, 'alternate currency cannot be selected'); await currency.selectOption(primaryCurrency);
      for (const name of ['QA甲', 'QA乙']) { await page.locator('.member-form [name="name"]').fill(name); await page.locator('.member-form [type="submit"]').click(); await page.waitForFunction(n => document.querySelector('[data-members]')?.textContent.includes(n), name); }
      let stored = await readLedger(); assert(stored.members.length === 2, 'two members not saved');
      const payer = stored.members.find(m => m.name === 'QA甲').id;
      await page.locator('.expense-form [name="amount"]').fill('120'); await page.locator('.expense-form [name="currency"]').selectOption(primaryCurrency);
      await page.locator('.expense-form [name="date"]').fill(profile.itinerary[0].date); await page.locator('.expense-form [name="payer"]').selectOption(payer);
      await page.locator('.expense-form [name="note"]').fill('QA测试晚餐');
      const split = page.locator('.expense-form [name="participant"]'); assert(await split.count() === 2, 'split member controls absent');
      for (const cb of await split.all()) await cb.check();
      await page.locator('.expense-form [type="submit"]').click(); await page.waitForFunction(currency => document.querySelector('.expense-list')?.textContent.includes(currency + ' 120.00'), primaryCurrency);
      assert(await currency.inputValue() === primaryCurrency, 'currency changed after saving primary currency expense');
      let balanceText = await page.locator('[data-settlements]').innerText(); assert(balanceText.includes('60.00') && balanceText.includes('QA乙') && balanceText.includes('QA甲'), '120 equal split should owe 60');
      await page.locator('.expense-list [data-edit]').first().click(); await page.locator('.expense-form [name="amount"]').fill('100');
      await page.locator('.expense-form [type="submit"]').click(); await page.waitForFunction(currency => document.querySelector('.expense-list')?.textContent.includes(currency + ' 100.00'), primaryCurrency);
      assert(await currency.inputValue() === primaryCurrency, 'currency changed after saving edited expense');
      stored = await readLedger(); assert(stored.expenses.length === 1 && stored.expenses[0].amount === 100 && stored.expenses[0].participants.length === 2, 'expense edit was not saved');
      await shot('ledger-edited'); await reload(); await openLedger();
      stored = await readLedger(); assert(stored.members.length === 2 && stored.expenses[0].amount === 100, 'ledger lost on page reload');
      balanceText = await page.locator('[data-settlements]').innerText(); assert(balanceText.includes('50.00'), 'edited equal split should owe 50 after reload');
      await page.locator('[data-settle]').first().click();
      await page.waitForFunction(() => document.querySelector('[data-settlements]')?.textContent.includes('已结清'));
      stored = await readLedger(); assert(stored.expenses.filter(e => e.kind === 'settlement').length === 1, 'repayment not stored');
      assert(stored.expenses.find(e => e.kind === 'settlement').amount === 50, 'repayment amount mismatch');
      assert((await page.locator('.expense-totals').innerText()).includes('100.00'), 'repayment must not increase spending total');
      await shot('ledger-settled'); await reload(); await openLedger();
      assert((await page.locator('[data-settlements]').innerText()).includes('已结清'), 'repayment lost after refresh');
      await closeTrip(); return { direct_dock_entry:true, currencies, default_currency:primaryCurrency, alternate_currency_selectable:true, currency_preserved_after_save:true, members: 2, initial_expense: 120, initial_equal_share: 60, edited_expense: 100, repayment: 50, total_spending: 100, page_reload_preserved: true };
    });
    await run('offline_manual_currency_conversion', async () => {
      await openLedger(); await page.locator('.exchange-tool > summary').click();
      await page.locator('[data-fx-from]').selectOption(primaryCurrency); await page.locator('[data-fx-to]').selectOption(alternateCurrency);
      await page.locator('[data-fx-refresh]').click();
      await page.waitForFunction(() => !document.querySelector('[data-fx-refresh]').disabled);
      await page.locator('[data-fx-amount]').fill('100'); await page.locator('[data-fx-rate]').fill('0.3');
      await page.waitForFunction(() => Number(document.querySelector('[data-fx-result]').textContent) === 30);
      const state = await page.locator('.exchange-tool').innerText();
      await shot('manual-fx'); await closeTrip(); return { input_currency:primaryCurrency, output_currency:alternateCurrency, amount:100, manually_entered_test_rate:0.3, expected_result:30, actual_text:state };
    });
    await run('checklist_reload', async () => {
      await navigate('booking'); const boxes = page.locator('#booking input[type="checkbox"]'); assert(await boxes.count() > 0, 'packing checklist missing');
      const first = boxes.first(); await openAncestors(first); await first.check(); assert(await first.isChecked(), 'checkbox not checked');
      const identity = await first.evaluate(e => ({ key: e.dataset.memoryKey || null, label: (e.closest('li') || e.parentElement).textContent.trim().slice(0,100) }));
      await shot('checklist'); await reload(); await navigate('booking'); await openAncestors(boxes.first());
      assert(await boxes.first().isChecked(), 'packing choice lost after reload'); return { identity, checked: true, page_reload_preserved: true };
    });
    await run('customizer_edit_reload', async () => {
      const openCustomizer = async () => { await page.locator('.atlas-mobile-dock').getByRole('button',{name:'调整',exact:true}).click(); await page.locator('#itinerary-customizer').waitFor({ state: 'visible' }); };
      await openCustomizer(); await page.locator(`#itinerary-customizer .custom-days [data-day="${testDay}"]`).click();
      const card = page.locator('#itinerary-customizer [data-place]').first(); const oldName = (await card.locator('[data-open-field="name"]').innerText()).trim(); const testName = oldName + ' QA保存';
      await card.locator('[data-open-field="name"]').click(); await card.locator('[data-field="name"]').fill(testName);
      await page.locator('#itinerary-customizer [data-freeform]').fill('QA测试：午休保持不变。');
      assert((await page.locator('.custom-request-list').innerText()).includes('QA保存'), 'customizer did not record edit');
      const photoInput=page.locator('#itinerary-customizer [data-photo-input]'); await openAncestors(photoInput); await photoInput.setInputFiles(fixturePNG);
      await page.waitForFunction(() => document.querySelector('.custom-photo-preview img')?.naturalWidth > 0);
      await page.waitForFunction(() => document.querySelector('.customizer-save-status')?.textContent.includes('已保存在本机'));
      await page.locator('.itinerary-customizer__close').click(); await page.locator('#itinerary-customizer').waitFor({ state: 'hidden' });
      await openCustomizer(); await page.locator(`#itinerary-customizer .custom-days [data-day="${testDay}"]`).click();
      assert((await page.locator('.custom-timeline').innerText()).includes(testName), 'edit lost on close/reopen');
      await shot('customizer-edit'); await reload(); await openCustomizer(); await page.locator(`#itinerary-customizer .custom-days [data-day="${testDay}"]`).click();
      assert((await page.locator('.custom-timeline').innerText()).includes(testName), 'edit lost after page reload');
      assert((await page.locator('#itinerary-customizer [data-freeform]').inputValue()).includes('QA测试'), 'freeform note lost after reload');
      assert(await page.locator('.custom-photo-preview img').count() === 1, 'customizer reference image lost after reload');
      await page.locator('.itinerary-customizer__close').click(); return { oldName, testName, close_reopen_preserved: true, page_reload_preserved: true, reference_photo_reload_preserved:true };
    });
    await run('photo_upload_reload', async () => {
      await openTrip(testDay); await page.locator('button[data-trip-view="photo"]').click();
      await page.locator('[data-trip-photo-input]').setInputFiles(fixturePNG);
      await page.waitForFunction(() => { const i = document.querySelector('.trip-uploaded-grid img'); return i?.complete && i.naturalWidth > 0; });
      assert(await page.locator('.trip-uploaded-photo').count() === 1, 'sample count after upload');
      await shot('photo-upload'); await reload(); await openTrip(testDay); await page.locator('button[data-trip-view="photo"]').click();
      await page.waitForFunction(() => { const i = document.querySelector('.trip-uploaded-grid img'); return i?.complete && i.naturalWidth > 0; });
      assert(await page.locator('.trip-uploaded-photo').count() === 1, 'sample lost or duplicated after reload');
      await page.locator('.trip-uploaded-grid img').click(); await page.locator('.trip-photo-viewer.is-open').waitFor({ state: 'visible' });
      await page.locator('.trip-photo-viewer button').click(); assert(!await page.locator('.trip-photo-viewer').isVisible(), 'sample preview did not close');
      await closeTrip(); return { fixture: fixturePNG, uploaded: 1, image_decoded: true, page_reload_preserved: true, preview_closed: true };
    });
    await run('ticket_image_pdf_reload', async () => {
      await openTrip(testDay); const add = page.locator('#trip-page-itinerary [data-ticket-add]').first(); assert(await add.count() === 1, 'ticket attachment entry missing');
      const key = await add.getAttribute('data-ticket-key');
      for (const [title, fixture] of [['QA票据图', fixturePNG], ['QA票据PDF', fixturePDF]]) {
        await add.click(); const panel = page.locator('.trip-ticket-overlay'); await panel.waitFor({ state: 'visible' });
        await panel.locator('input[name="title"]').fill(title); await panel.locator('input[name="file"]').setInputFiles(fixture);
        await panel.locator('button[type="submit"]').click(); await panel.waitFor({ state: 'detached' });
        await page.locator('.trip-ticket-shortcut').filter({ hasText: title }).first().waitFor({ state: 'visible' });
      }
      await reload(); await openTrip(testDay);
      const imageButton = page.locator('.trip-ticket-shortcut').filter({ hasText: 'QA票据图' }).first(); await imageButton.waitFor({ state: 'visible' }); await imageButton.click();
      await page.locator('.trip-ticket-preview').waitFor({ state: 'visible' });
      await page.waitForFunction(() => { const i = document.querySelector('.trip-ticket-preview img'); return i?.complete && i.naturalWidth > 0; });
      await shot('ticket-image'); await page.locator('[data-preview-close]').click();
      const pdfButton = page.locator('.trip-ticket-shortcut').filter({ hasText: 'QA票据PDF' }).first(); await pdfButton.waitFor({ state: 'visible' });
      await pdfButton.click(); await page.locator('.mobile-runtime-sheet').waitFor({ state: 'visible' });
      const preview = await page.locator('.mobile-runtime-sheet').evaluate(e => ({ text: e.innerText, iframe: !!e.querySelector('iframe'), localLinks: [...e.querySelectorAll('a')].map(a => ({ text: a.textContent, scheme: a.href.split(':')[0], target: a.target, download:a.download })), buttons: [...e.querySelectorAll('button')].map(b => b.textContent) }));
      assert(preview.iframe && preview.localLinks.some(a => a.scheme==='blob' && a.download), 'PDF needs a same-page iframe and downloadable local blob');
      await shot('ticket-pdf'); await page.locator('.mobile-runtime-sheet').getByRole('button',{name:'关闭',exact:true}).click();
      assert(result.unexpected_popups.length === 0, 'iPhone PDF unexpectedly opened a new popup');
      await closeTrip(); return { place_key: key, files: ['PNG','PDF'], page_reload_preserved: true, image_preview_decoded: true, iphone_pdf_preview: preview, no_external_navigation: true };
    });
    await run('clipboard_denial_full_text_fallback', async () => {
      await page.locator('[data-dock="edit"]').click(); await page.locator('#itinerary-customizer').waitFor({state:'visible'});
      await page.locator('#itinerary-customizer [data-freeform]').fill('QA复制失败：请保留完整申请与原行程。');
      await page.waitForFunction(() => document.querySelector('.customizer-save-status')?.textContent.includes('已保存在本机'));
      await page.evaluate(() => {
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(value){window.__qaAttemptedCopy=value;return Promise.reject(new DOMException('QA clipboard denied','NotAllowedError'));}}});
        document.execCommand = function(command){if(command==='copy')window.__qaAttemptedCopy=document.activeElement.value;return false;};
      });
      await page.locator('#itinerary-customizer [data-copy]').click();
      const sheet=page.locator('.mobile-runtime-sheet'); await sheet.waitFor({state:'visible'});
      const actual=await sheet.locator('textarea').inputValue(); const expected=await page.evaluate(()=>window.__qaAttemptedCopy);
      assert(actual===expected && actual.includes('QA复制失败') && actual.includes('执行要求：'), 'manual fallback truncated or changed complete attempted copy');
      await sheet.getByRole('button',{name:'全选文字',exact:true}).click();
      const selection=await sheet.locator('textarea').evaluate(e=>({start:e.selectionStart,end:e.selectionEnd,length:e.value.length}));
      assert(selection.start===0 && selection.end===selection.length, 'manual copy select-all incomplete');
      await shot('clipboard-denied'); await sheet.getByRole('button',{name:'关闭',exact:true}).click();
      await page.locator('.itinerary-customizer__close').click();
      return { fault_injection:'navigator.clipboard rejects and document.execCommand(copy) returns false in this temporary page only', full_text_exact_match:true, characters:actual.length, selection };
    });
    await run('idb_denial_visible_failure_complete_export', async () => {
      await page.locator('[data-dock="edit"]').click(); await page.locator('#itinerary-customizer').waitFor({state:'visible'});
      await page.locator('#itinerary-customizer [data-freeform]').fill('QA存储故障前的草稿');
      await page.waitForFunction(() => document.querySelector('.customizer-save-status')?.textContent.includes('已保存在本机'));
      await page.evaluate(() => {Object.defineProperty(indexedDB,'open',{configurable:true,value(){throw new DOMException('QA storage denied','SecurityError');}});});
      const note='QA存储拒绝：这段修改必须仍可导出。'; await page.locator('#itinerary-customizer [data-freeform]').fill(note);
      await page.waitForFunction(() => document.querySelector('.customizer-save-status')?.textContent.includes('保存失败'));
      assert(await page.locator('#itinerary-customizer [data-freeform]').inputValue()===note, 'draft input discarded after denied storage');
      const failureText=await page.locator('.customizer-save-status').innerText();
      await page.locator('#itinerary-customizer [data-download]').click(); const sheet=page.locator('.mobile-runtime-sheet'); await sheet.waitFor({state:'visible'});
      const downloaded=await sheet.locator('a[download]').evaluate(async a => ({name:a.download,scheme:a.href.split(':')[0],data:await (await fetch(a.href)).json()}));
      assert(downloaded.scheme==='blob' && downloaded.data.freeformSuggestion===note && downloaded.data.currentItinerary.length===dayCount, 'export lost unsaved note or complete original itinerary');
      await shot('storage-denied-export'); await sheet.getByRole('button',{name:'关闭',exact:true}).click();
      await page.locator('.itinerary-customizer__close').click();
      return { fault_injection:'indexedDB.open throws SecurityError in this temporary page only', failureText, input_retained:true, export_file:downloaded.name, export_original_days:downloaded.data.currentItinerary.length, export_operations:downloaded.data.operations.length, export_reference_images:downloaded.data.referenceImages.length, unsaved_note_in_export:true };
    });
    await run('embedded_images_and_widths', async () => {
      const decoded = await page.evaluate(async () => { const srcs = [...new Set([...document.images].map(e => e.src).filter(Boolean))]; const rows = await Promise.all(srcs.map(async src => { const im = new Image(); im.src = src; try { await Promise.race([im.decode(), new Promise((_, reject) => setTimeout(() => reject(Error('decode timeout')), 7000))]); return { ok: im.naturalWidth > 0, width: im.naturalWidth, scheme: src.split(':')[0] }; } catch (e) { return { ok: false, scheme: src.split(':')[0], error: e.message }; } })); return { count: rows.length, failed: rows.filter(r => !r.ok), schemes: [...new Set(rows.map(r => r.scheme))] }; });
      assert(decoded.failed.length === 0, 'embedded image decode failures: ' + JSON.stringify(decoded));
      const widths = [];
      for (const width of [320,375,390,430]) { await page.setViewportSize({ width, height: 844 }); await settleUI(); const row = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); widths.push(row); assert(row.scroll <= row.width, 'body horizontal overflow at ' + width + ': ' + JSON.stringify(row)); }
      await page.setViewportSize({ width:390, height:844 }); return { decoded, widths };
    });
    result.finished_at = new Date().toISOString();
    result.sha256_after = hash(fs.readFileSync(file));
    result.source_changed_during_run = result.sha256_after !== result.sha256;
    result.status = result.checks.length && result.checks.every(c => c.status === 'passed') && !result.page_errors.length && !result.unexpected_popups.length && !result.source_changed_during_run ? 'passed' : 'failed';
    save(); console.log(JSON.stringify({ status: result.status, checks: result.checks.map(c => ({ id:c.id, status:c.status, error:c.error })), page_errors: result.page_errors, report:reportPath }, null, 2));
    if (result.status !== 'passed') process.exitCode = 1;
    await context.close();
  } finally { await browser.close(); }
})().catch(e => { result.status = 'failed'; result.fatal_error = e.stack; save(); console.error(e); process.exitCode = 1; });
