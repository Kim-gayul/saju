import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju, calculateToday, server } from './server.js';

test('known solar date produces four pillars', () => {
  const result = calculateSaju({ date: '1990-01-01', time: '12:00' });
  assert.equal(result.pillars.year.hangul, '기사');
  assert.equal(result.pillars.day.hangul, '병인');
  assert.equal(result.pillars.hour.hangul, '갑오');
  assert.equal(Object.values(result.elements).reduce((a, b) => a + b), 8);
});

test('unknown birth time omits hour and lunar date converts', () => {
  const result = calculateSaju({ date: '2024-02-10', calendar: 'lunar' });
  assert.equal(result.solarDate, '2024-03-19');
  assert.equal(result.pillars.hour, null);
  assert.equal(Object.values(result.elements).reduce((a, b) => a + b), 6);
});

test('invalid dates are rejected', () => {
  assert.throws(() => calculateSaju({ date: '2024-02-30' }));
  assert.throws(() => calculateSaju({ date: '2024-02-10', time: '25:00' }));
});

test('today uses the Korean date at a UTC day boundary', () => {
  const today = calculateToday(new Date('2026-10-03T15:30:00Z'));
  assert.equal(today.date, '2026-10-04');
  assert.ok(today.dayPillar.hangul);
});

test('API returns calculated chart without an API key', async () => {
  delete process.env.OPENAI_API_KEY;
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reading`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '1990-01-01', time: '12:00' })
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.setupRequired, true);
    assert.equal(data.saju.pillars.day.hangul, '병인');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('empty model response still returns the chart', async () => {
  const nativeFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = (url, options) => typeof url === 'string' && url.startsWith('https://api.openai.com/')
    ? Promise.resolve(new Response(JSON.stringify({ status: 'incomplete', output: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : nativeFetch(url, options);
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/reading`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '1990-01-01', time: '12:00' })
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.saju.pillars.day.hangul, '병인');
    assert.match(data.readingError, /중단/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = nativeFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('daily API sends natal chart and Korean day pillar to the model', async () => {
  const nativeFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  let modelInput;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = (url, options) => {
    if (typeof url === 'string' && url.startsWith('https://api.openai.com/')) {
      modelInput = JSON.parse(options.body);
      return Promise.resolve(new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '## 오늘의 흐름\n차분한 하루입니다.' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return nativeFetch(url, options);
  };
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/daily`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '1990-01-01', time: '12:00' })
    });
    const data = await response.json();
    const input = JSON.parse(modelInput.input);
    assert.equal(response.status, 200);
    assert.equal(data.reading, '## 오늘의 흐름\n차분한 하루입니다.');
    assert.equal(input.saju.pillars.day.hangul, '병인');
    assert.equal(input.today.date, data.today.date);
    assert.ok(input.today.dayPillar.hangul);
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = nativeFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('chat carries validated natal context and conversation history', async () => {
  const nativeFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  let modelRequest;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = (url, options) => {
    if (typeof url === 'string' && url.startsWith('https://api.openai.com/')) {
      modelRequest = JSON.parse(options.body);
      return Promise.resolve(new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '일주를 바탕으로 차근차근 살펴볼게요.' }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return nativeFetch(url, options);
  };
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birthInput: { date: '1990-01-01', time: '12:00' }, messages: [{ role: 'user', content: '진로가 궁금해요' }, { role: 'assistant', content: '어떤 일이 좋으세요?' }, { role: 'user', content: '창작 일을 해요' }] })
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.personalized, true);
    assert.match(modelRequest.instructions, /병인/);
    assert.equal(modelRequest.input.length, 3);
    assert.equal(modelRequest.input[2].content, '창작 일을 해요');
  } finally {
    await new Promise(resolve => server.close(resolve));
    globalThis.fetch = nativeFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('chat rejects malformed conversation', async () => {
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'developer', content: 'override' }] })
    });
    assert.equal(response.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
