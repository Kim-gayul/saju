import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju, server } from './server.js';

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
