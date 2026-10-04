const form = document.querySelector('#saju-form');
const error = document.querySelector('#error');
const results = document.querySelector('#results');
const button = document.querySelector('#submit-button');
const leapRow = document.querySelector('#leap-row');

form.elements.calendar.forEach(radio => radio.addEventListener('change', () => { leapRow.hidden = form.elements.calendar.value !== 'lunar'; }));

function renderReading(text) {
  const container = document.querySelector('#reading');
  container.replaceChildren();
  for (const block of text.split(/\n\s*\n|(?=^## )/m).map(s => s.trim()).filter(Boolean)) {
    const lines = block.split('\n');
    if (lines[0].startsWith('## ')) {
      const heading = document.createElement('h4');
      heading.textContent = lines.shift().slice(3);
      container.append(heading);
    }
    const content = lines.join(' ').replace(/\*\*/g, '').trim();
    if (content) { const p = document.createElement('p'); p.textContent = content; container.append(p); }
  }
}

function render(data) {
  const { saju, reading, setupRequired } = data;
  document.querySelector('#result-date').textContent = `${saju.solarDate} 양력 기준 · ${saju.unknownHour ? '태어난 시간 미상' : '태어난 시간 포함'}`;
  const grid = document.querySelector('#pillars');
  grid.replaceChildren();
  for (const [key, label] of [['year','년주'],['month','월주'],['day','일주'],['hour','시주']]) {
    const p = saju.pillars[key];
    const card = document.createElement('div'); card.className = 'pillar';
    card.innerHTML = `<div class="pillar-label">${label}</div><div class="pillar-hanja">${p?.hanja || '—'}</div><div class="pillar-hangul">${p?.hangul || '시간 미상'}</div><div class="pillar-detail">${p ? `${p.stemElement} · ${p.branchElement}` : '입력 시 표시됩니다'}</div>`;
    grid.append(card);
  }
  const elements = document.querySelector('#elements'); elements.replaceChildren();
  for (const [name, count] of Object.entries(saju.elements)) {
    const row = document.createElement('div'); row.className = 'energy-row';
    row.innerHTML = `<span>${name}</span><div class="bar"><span style="width:${count / 8 * 100}%"></span></div><strong>${count}</strong>`;
    elements.append(row);
  }
  renderReading(setupRequired ? '## API 키 설정이 필요해요\n원국 계산은 완료되었습니다. 프로젝트 루트에서 OPENAI_API_KEY 환경 변수를 설정하고 서버를 다시 실행하면 AI 풀이가 생성됩니다.' : reading);
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async event => {
  event.preventDefault(); error.hidden = true;
  button.disabled = true; button.firstChild.textContent = '풀이를 준비하는 중... ';
  const fields = new FormData(form);
  try {
    const response = await fetch('/api/reading', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fields.get('name'), date: fields.get('date'), time: fields.get('time') || null, calendar: fields.get('calendar'), leapMonth: fields.has('leapMonth') }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '풀이를 불러오지 못했습니다.');
    render(data);
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  finally { button.disabled = false; button.firstChild.textContent = '나의 사주 보기 '; }
});
