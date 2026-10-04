import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Solar, Lunar } from 'lunar-javascript';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const stems = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const branches = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const koStems = ['갑','을','병','정','무','기','경','신','임','계'];
const koBranches = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const elementNames = ['목','화','토','금','수'];
const stemElements = [0,0,1,1,2,2,3,3,4,4];
const branchElements = [4,2,0,0,2,1,1,2,3,3,2,4];

function translate(pillar) {
  if (!pillar) return null;
  const s = stems.indexOf(pillar[0]);
  const b = branches.indexOf(pillar[1]);
  if (s < 0 || b < 0) throw new Error('간지 변환에 실패했습니다.');
  return { hanja: pillar, hangul: koStems[s] + koBranches[b], stem: koStems[s], branch: koBranches[b], stemElement: elementNames[stemElements[s]], branchElement: elementNames[branchElements[b]] };
}

export function calculateSaju(input) {
  const { date, time, calendar = 'solar', leapMonth = false } = input || {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('생년월일을 확인해 주세요.');
  if (time !== null && time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('태어난 시간을 확인해 주세요.');
  if (!['solar', 'lunar'].includes(calendar)) throw new Error('달력 종류를 확인해 주세요.');
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1900 || year > 2100) throw new Error('1900년부터 2100년 사이의 날짜를 입력해 주세요.');
  const [hour, minute] = time == null ? [12, 0] : time.split(':').map(Number);
  let solar;
  try {
    if (calendar === 'solar') {
      const check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error('유효하지 않은 날짜입니다.');
      solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
    } else {
      const lunar = Lunar.fromYmdHms(year, leapMonth ? -month : month, day, hour, minute, 0);
      if (Math.abs(lunar.getMonth()) !== month || lunar.getDay() !== day || lunar.getYear() !== year) throw new Error('유효하지 않은 음력 날짜입니다.');
      solar = lunar.getSolar();
    }
  } catch { throw new Error('유효하지 않은 날짜이거나 윤달 설정이 맞지 않습니다.'); }
  const eight = solar.getLunar().getEightChar();
  const pillars = {
    year: translate(eight.getYear()), month: translate(eight.getMonth()), day: translate(eight.getDay()),
    hour: time == null ? null : translate(eight.getTime())
  };
  const counts = Object.fromEntries(elementNames.map(e => [e, 0]));
  for (const pillar of Object.values(pillars)) if (pillar) { counts[pillar.stemElement]++; counts[pillar.branchElement]++; }
  return { input: { date, time: time ?? null, calendar, leapMonth: calendar === 'lunar' && !!leapMonth }, solarDate: solar.toYmd(), pillars, elements: counts, dayMaster: pillars.day.stem + '목화토금수'[stemElements[stems.indexOf(pillars.day.hanja[0])]], unknownHour: time == null };
}

const instructions = `당신은 한국어 사주 풀이 도우미입니다. 제공된 사주 원국만 사용하세요. 원국을 다시 계산하거나 없는 시주를 만들어내지 마세요. 전통적 상징에 기초한 자기 성찰용 해석으로 작성하고, 단정적 운명 예언을 피하세요. 건강·투자·법률·관계의 중대한 결정을 유도하지 마세요. 사용자가 제공한 이름이 있다면 호칭에만 쓰세요. 마크다운으로 다음 순서로 작성하세요: ## 한눈에 보는 기운, ## 성향과 강점, ## 관계와 일, ## 지금 해볼 작은 실천. 각 절은 짧고 따뜻하게, 구체적인 원국 근거를 1개 이상 포함하세요. 시주가 없으면 해석 범위가 제한됨을 언급하세요. 마지막에 '이 해석은 전통 문화에 기반한 참고용 콘텐츠입니다.'를 넣으세요.`;

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10000) throw new Error('요청이 너무 큽니다.');
  }
  try { return JSON.parse(raw); } catch { throw new Error('요청 형식이 올바르지 않습니다.'); }
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/reading') {
    try {
      const body = await readBody(req);
      const saju = calculateSaju(body);
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 30) : '';
      if (!process.env.OPENAI_API_KEY) return send(res, 200, { saju, reading: null, setupRequired: true });
      const api = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', instructions, input: JSON.stringify({ name, ...saju }), max_output_tokens: 900, store: false }),
        signal: AbortSignal.timeout(60000)
      });
      const result = await api.json();
      if (!api.ok) throw new Error(result.error?.message || 'OpenAI 응답을 받지 못했습니다.');
      const reading = (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
      if (!reading) throw new Error('풀이 결과가 비어 있습니다. 다시 시도해 주세요.');
      send(res, 200, { saju, reading });
    } catch (error) { send(res, 400, { error: error.message || '요청을 처리하지 못했습니다.' }); }
    return;
  }
  if (req.method !== 'GET') return send(res, 405, { error: '지원하지 않는 요청입니다.' });
  const files = { '/': ['index.html','text/html'], '/styles.css': ['styles.css','text/css'], '/app.js': ['app.js','text/javascript'] };
  const match = files[req.url];
  if (!match) return send(res, 404, { error: '페이지를 찾을 수 없습니다.' });
  try {
    const file = await readFile(path.join(root, 'public', match[0]));
    res.writeHead(200, { 'Content-Type': `${match[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(file);
  } catch { send(res, 500, { error: '파일을 읽을 수 없습니다.' }); }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, () => console.log(`Saju Studio: http://localhost:${port}`));
}
