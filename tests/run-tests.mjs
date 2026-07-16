// Testy na rzeczywistej logice workflow: kod node'ów jest wyciągany
// z workflows/whatsapp-assistant.json i uruchamiany w sandboxie vm,
// więc testujemy dokładnie to, co wykona n8n — nie kopię.
//
// Uruchomienie: node tests/run-tests.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = JSON.parse(readFileSync(join(here, '..', 'workflows', 'whatsapp-assistant.json'), 'utf8'));

function nodeCode(name) {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Brak node'a "${name}" w workflow`);
  return node.parameters.jsCode;
}

// Sandbox odtwarzający środowisko Code node'a w n8n
function runNode(name, ctx) {
  const code = nodeCode(name);
  const sandbox = {
    require: (mod) => {
      if (mod === 'crypto') return crypto;
      throw new Error(`Moduł zablokowany w sandboxie: ${mod}`);
    },
    Buffer, Intl, Date, JSON, Math, Number, String, Object, Array, console,
    $env: ctx.$env || {},
    $json: ctx.$json || {},
    $input: ctx.$input || { all: () => [], item: undefined },
    $: (nodeName) => ({
      first: () => ({ json: (ctx.$nodes || {})[nodeName] || {} }),
    }),
  };
  const script = new vm.Script(`(function () {\n${code}\n})()`);
  return script.runInNewContext(vm.createContext(sandbox));
}

// ── Fixtures: realistyczny payload WhatsApp Cloud API ──

const APP_SECRET = 'test-secret-123';

const textMessagePayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '102290129340398',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550000000', phone_number_id: '106540352242922' },
        contacts: [{ profile: { name: 'Anna Kowalska' }, wa_id: '48600000000' }],
        messages: [{
          from: '48600000000',
          id: 'wamid.HBgLNDg2MDAwMDAwMDAVAgARGBI5QTNDQTVCM0Q0Q0Q2RTY3RTcA',
          timestamp: '1784192040',
          text: { body: 'Ile kosztuje manicure hybrydowy?' },
          type: 'text',
        }],
      },
      field: 'messages',
    }],
  }],
};

const statusUpdatePayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '102290129340398',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550000000', phone_number_id: '106540352242922' },
        statuses: [{ id: 'wamid.X', status: 'delivered', timestamp: '1784192050', recipient_id: '48600000000' }],
      },
      field: 'messages',
    }],
  }],
};

function sign(bodyString, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
}

function webhookCtx(bodyString, signature) {
  return {
    $env: { WHATSAPP_APP_SECRET: APP_SECRET },
    $json: { headers: signature === undefined ? {} : { 'x-hub-signature-256': signature } },
    $input: { item: { binary: { data: { data: Buffer.from(bodyString).toString('base64') } } } },
  };
}

// ── Mini-runner ──

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${desc}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${desc}\n       ${err.message}`);
  }
}

function assertEqual(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label} oczekiwano ${e}, otrzymano ${a}`);
}

function assertThrows(fn, fragment) {
  try {
    fn();
  } catch (err) {
    if (fragment && !err.message.includes(fragment)) {
      throw new Error(`błąd nie zawiera "${fragment}": ${err.message}`);
    }
    return;
  }
  throw new Error('oczekiwano wyjątku, kod przeszedł bez błędu');
}

// ── 1. Weryfikacja podpisu X-Hub-Signature-256 ──

console.log('\nVerify Signature:');

test('poprawny podpis przechodzi i zwraca sparsowany payload', () => {
  const body = JSON.stringify(textMessagePayload);
  const result = runNode('Verify Signature', webhookCtx(body, sign(body, APP_SECRET)));
  assertEqual(result.json.object, 'whatsapp_business_account');
});

test('podpis liczony złym sekretem jest odrzucany', () => {
  const body = JSON.stringify(textMessagePayload);
  const badSig = sign(body, 'inny-sekret');
  assertThrows(() => runNode('Verify Signature', webhookCtx(body, badSig)), 'Niepoprawny podpis');
});

test('podmieniona treść (ten sam podpis) jest odrzucana', () => {
  const body = JSON.stringify(textMessagePayload);
  const sig = sign(body, APP_SECRET);
  const tampered = body.replace('manicure', 'MANICURE');
  assertThrows(() => runNode('Verify Signature', webhookCtx(tampered, sig)), 'Niepoprawny podpis');
});

test('brak nagłówka podpisu jest odrzucany', () => {
  const body = JSON.stringify(textMessagePayload);
  assertThrows(() => runNode('Verify Signature', webhookCtx(body, undefined)), 'Brak naglowka');
});

// ── 2. Parsowanie wiadomości ──

console.log('\nParse Message:');

test('wiadomość tekstowa daje from/text/name', () => {
  const out = runNode('Parse Message', { $input: { all: () => [{ json: textMessagePayload }] } });
  assertEqual(out.length, 1, 'liczba itemów:');
  assertEqual(out[0].json.from, '48600000000', 'from:');
  assertEqual(out[0].json.text, 'Ile kosztuje manicure hybrydowy?', 'text:');
  assertEqual(out[0].json.name, 'Anna Kowalska', 'name:');
});

test('status doręczenia (delivered) jest ignorowany', () => {
  const out = runNode('Parse Message', { $input: { all: () => [{ json: statusUpdatePayload }] } });
  assertEqual(out.length, 0, 'liczba itemów:');
});

test('wiadomość nietekstowa (obrazek) jest ignorowana', () => {
  const img = structuredClone(textMessagePayload);
  img.entry[0].changes[0].value.messages[0] = { from: '48600000000', id: 'wamid.Y', type: 'image', image: { id: 'img1' } };
  const out = runNode('Parse Message', { $input: { all: () => [{ json: img }] } });
  assertEqual(out.length, 0, 'liczba itemów:');
});

// ── 3. Klasyfikacja intencji: zasada bezpieczna ──

console.log('\nParse Intent (zasada bezpieczna):');

const customer = { from: '48600000000', text: 'Ile kosztuje manicure hybrydowy?', name: 'Anna Kowalska' };

function intentCtx(content) {
  return {
    $json: { choices: [{ message: { content } }] },
    $nodes: { 'Parse Message': customer },
  };
}

test('faq z wysoką pewnością trafia do faq', () => {
  const r = runNode('Parse Intent', intentCtx('{"intent": "faq", "confidence": 0.95}'));
  assertEqual(r.json.intent, 'faq');
});

test('rezerwacja z wysoką pewnością trafia do rezerwacji', () => {
  const r = runNode('Parse Intent', intentCtx('{"intent": "rezerwacja", "confidence": 0.9}'));
  assertEqual(r.json.intent, 'rezerwacja');
});

test('niska pewność (0.5) eskaluje zamiast zgadywać', () => {
  const r = runNode('Parse Intent', intentCtx('{"intent": "faq", "confidence": 0.5}'));
  assertEqual(r.json.intent, 'eskalacja');
});

test('kategoria "inne" eskaluje do człowieka', () => {
  const r = runNode('Parse Intent', intentCtx('{"intent": "inne", "confidence": 0.99}'));
  assertEqual(r.json.intent, 'eskalacja');
});

test('niepoprawny JSON od modelu eskaluje', () => {
  const r = runNode('Parse Intent', intentCtx('przepraszam, nie umiem tego sklasyfikować'));
  assertEqual(r.json.intent, 'eskalacja');
});

test('nieznana kategoria od modelu eskaluje', () => {
  const r = runNode('Parse Intent', intentCtx('{"intent": "spam", "confidence": 0.99}'));
  assertEqual(r.json.intent, 'eskalacja');
});

// ── 4. Odpowiedź FAQ ──

console.log('\nParse FAQ Answer:');

test('znaleziona odpowiedź ma found=true i treść', () => {
  const r = runNode('Parse FAQ Answer', intentCtx('{"found": true, "reply": "Manicure hybrydowy kosztuje 120 zł."}'));
  assertEqual(r.json.found, true, 'found:');
  assertEqual(r.json.reply, 'Manicure hybrydowy kosztuje 120 zł.', 'reply:');
  assertEqual(r.json.handled_by, 'bot', 'handled_by:');
});

test('brak odpowiedzi w bazie daje found=false (droga do eskalacji)', () => {
  const r = runNode('Parse FAQ Answer', intentCtx('{"found": false, "reply": ""}'));
  assertEqual(r.json.found, false);
});

test('found=true z pustą odpowiedzią traktowane jak brak (nie wysyłamy pustki)', () => {
  const r = runNode('Parse FAQ Answer', intentCtx('{"found": true, "reply": "  "}'));
  assertEqual(r.json.found, false);
});

// ── 5. Wolne terminy z kalendarza ──

console.log('\nPick Free Slots:');

// pon 20.07.2026, 06:00 UTC = 08:00 w Warszawie (UTC+2 latem)
const MONDAY_MORNING = '2026-07-20T06:00:00Z';

function slotsCtx(busy, testNow = MONDAY_MORNING) {
  const calendarResponse = { calendars: { primary: { busy } }, __testNow: testNow };
  return {
    $json: calendarResponse,
    $input: { all: () => [{ json: calendarResponse }] },
    $nodes: { 'Parse Message': customer },
  };
}

test('pusty kalendarz: 3 sloty od 10:00 (2h wyprzedzenia od 8:00)', () => {
  const r = runNode('Pick Free Slots', slotsCtx([]));
  const reply = r[0].json.reply;
  for (const expected of ['pon 20.07 o 10:00', 'pon 20.07 o 11:00', 'pon 20.07 o 12:00']) {
    if (!reply.includes(expected)) throw new Error(`brak "${expected}" w odpowiedzi:\n${reply}`);
  }
});

test('zajęty slot 10:00-11:00 jest pomijany', () => {
  const busy = [{ start: '2026-07-20T08:00:00Z', end: '2026-07-20T09:00:00Z' }]; // 10-11 lokalnie
  const r = runNode('Pick Free Slots', slotsCtx(busy));
  const reply = r[0].json.reply;
  if (reply.includes('o 10:00')) throw new Error(`slot 10:00 powinien być zajęty:\n${reply}`);
  for (const expected of ['o 11:00', 'o 12:00', 'o 13:00']) {
    if (!reply.includes(expected)) throw new Error(`brak "${expected}" w odpowiedzi:\n${reply}`);
  }
});

test('niedziela jest pomijana, sobota kończy się przed 14:00', () => {
  // sob 25.07.2026, 11:30 UTC = 13:30 lokalnie; pierwszy slot >= 15:30 -> sobota już zamknięta
  const r = runNode('Pick Free Slots', slotsCtx([], '2026-07-25T11:30:00Z'));
  const reply = r[0].json.reply;
  if (reply.includes('sob')) throw new Error(`sobota po 14:00 nie powinna mieć slotów:\n${reply}`);
  if (reply.includes('niedz')) throw new Error(`niedziela powinna być pominięta:\n${reply}`);
  if (!reply.includes('pon 27.07 o 09:00')) throw new Error(`pierwszy slot powinien być pon 27.07 o 09:00:\n${reply}`);
});

test('cały tydzień zajęty: uczciwa odpowiedź zamiast zmyślonego terminu', () => {
  const busy = [{ start: '2026-07-19T00:00:00Z', end: '2026-07-28T00:00:00Z' }];
  const r = runNode('Pick Free Slots', slotsCtx(busy));
  if (!r[0].json.reply.includes('nie mamy wolnych terminow')) {
    throw new Error(`oczekiwano odpowiedzi o braku terminów:\n${r[0].json.reply}`);
  }
});

// ── 6. Przebieg end-to-end: webhook -> podpis -> parsowanie -> intencja -> routing ──

console.log('\nEnd-to-end (pełny przebieg wiadomości):');

test('wiadomość FAQ przechodzi całą ścieżkę do gałęzi faq', () => {
  // 1. przychodzi podpisane żądanie od Mety
  const body = JSON.stringify(textMessagePayload);
  const verified = runNode('Verify Signature', webhookCtx(body, sign(body, APP_SECRET)));

  // 2. parsowanie payloadu
  const parsed = runNode('Parse Message', { $input: { all: () => [{ json: verified.json }] } });
  assertEqual(parsed.length, 1, 'parsowanie:');

  // 3. budowa requestu klasyfikacji — prompt zawiera treść klienta
  const req = runNode('Build Classification Request', { $json: parsed[0].json });
  assertEqual(req.json.body.messages[1].content, 'Ile kosztuje manicure hybrydowy?', 'prompt user:');

  // 4. OpenAI odpowiada (zamockowane) -> Parse Intent -> routing
  const intent = runNode('Parse Intent', {
    $json: { choices: [{ message: { content: '{"intent": "faq", "confidence": 0.97}' } }] },
    $nodes: { 'Parse Message': parsed[0].json },
  });
  assertEqual(intent.json.intent, 'faq', 'intencja:');
  assertEqual(intent.json.from, '48600000000', 'numer klienta zachowany:');
});

test('reklamacja przechodzi całą ścieżkę do eskalacji', () => {
  const complaint = structuredClone(textMessagePayload);
  complaint.entry[0].changes[0].value.messages[0].text.body = 'Jestem bardzo niezadowolona z wczorajszego zabiegu, chcę zwrot!';
  const body = JSON.stringify(complaint);

  const verified = runNode('Verify Signature', webhookCtx(body, sign(body, APP_SECRET)));
  const parsed = runNode('Parse Message', { $input: { all: () => [{ json: verified.json }] } });
  const intent = runNode('Parse Intent', {
    $json: { choices: [{ message: { content: '{"intent": "eskalacja", "confidence": 0.92}' } }] },
    $nodes: { 'Parse Message': parsed[0].json },
  });
  assertEqual(intent.json.intent, 'eskalacja');
});

// ── Podsumowanie ──

console.log(`\n${passed} testów zaliczonych, ${failed} niezaliczonych`);
process.exit(failed === 0 ? 0 : 1);
