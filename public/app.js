const form = document.querySelector('#saju-form');
const error = document.querySelector('#error');
const results = document.querySelector('#results');
const button = document.querySelector('#submit-button');
const leapRow = document.querySelector('#leap-row');
const dailyButton = document.querySelector('#daily-button');
const dailyResult = document.querySelector('#daily-result');
let currentBirthInput = null;
let currentSaju = null;
let chatHistory = [];
let chatBusy = false;
const chatMessages = document.querySelector('#chat-messages');
const chatInput = document.querySelector('#chat-input');

function showView(view) {
  for (const name of ['reading', 'daily', 'chat']) document.querySelector(`#${name}-view`).hidden = name !== view;
  for (const item of document.querySelectorAll('.nav-button')) {
    const active = item.dataset.view === view;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  }
  if (view === 'daily') {
    document.querySelector('#daily-empty').hidden = !!currentBirthInput;
    document.querySelector('#daily-ready').hidden = !currentBirthInput;
    if (currentSaju) document.querySelector('#daily-profile').textContent = `${currentSaju.solarDate} 출생 · ${currentSaju.pillars.day.hangul} 일주 기준`;
  }
  if (view === 'chat') {
    document.querySelector('#chat-profile').textContent = currentSaju ? `${currentSaju.pillars.day.hangul} 일주 · 사주 기반 맞춤 상담` : '일반 상담 · 원국을 입력하면 맞춤 상담이 가능합니다';
    if (!chatMessages.childElementCount) appendChat('assistant', currentSaju ? '어서 오세요. 방금 살펴본 사주 원국을 곁에 두고 이야기 나눠볼게요. 지금 가장 궁금한 것은 무엇인가요?' : '안녕하세요, 결 상담가입니다. 편하게 이야기를 들려주세요. 개인 사주에 맞춘 상담은 사주풀이를 먼저 진행하면 가능합니다.');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-button').forEach(item => item.addEventListener('click', () => showView(item.dataset.view)));
document.querySelectorAll('.go-reading').forEach(item => item.addEventListener('click', () => showView('reading')));
document.querySelector('#continue-chat').addEventListener('click', () => { showView('chat'); chatInput.focus(); });

function appendChat(role, text, temporary = false) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}${temporary ? ' pending' : ''}`;
  bubble.textContent = text;
  chatMessages.append(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

async function sendChat(message) {
  if (chatBusy || !message.trim()) return;
  chatBusy = true;
  document.querySelector('#chat-send').disabled = true;
  document.querySelector('#chat-suggestions').hidden = true;
  const text = message.trim();
  appendChat('user', text);
  const pending = appendChat('assistant', '답을 고르고 있어요…', true);
  try {
    const messages = [...chatHistory.slice(-11), { role: 'user', content: text }];
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birthInput: currentBirthInput, messages }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '답변을 불러오지 못했습니다.');
    pending.classList.remove('pending');
    pending.textContent = data.answer;
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.answer });
  } catch (cause) {
    pending.classList.add('chat-failure');
    pending.textContent = `답변을 받지 못했어요. ${cause.message}`;
  } finally {
    chatBusy = false;
    document.querySelector('#chat-send').disabled = false;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.focus();
  }
}

document.querySelector('#chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const message = chatInput.value;
  if (!message.trim() || chatBusy) return;
  chatInput.value = '';
  sendChat(message);
});
chatInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); document.querySelector('#chat-form').requestSubmit(); }
});
document.querySelectorAll('[data-prompt]').forEach(item => item.addEventListener('click', () => sendChat(item.dataset.prompt)));

form.elements.calendar.forEach(radio => radio.addEventListener('change', () => { leapRow.hidden = form.elements.calendar.value !== 'lunar'; }));

function renderReading(container, text) {
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
  const { saju, reading, setupRequired, readingError } = data;
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
  renderReading(document.querySelector('#reading'), setupRequired ? '## API 키 설정이 필요해요\n원국 계산은 완료되었습니다. 프로젝트 루트에서 OPENAI_API_KEY 환경 변수를 설정하고 서버를 다시 실행하면 AI 풀이가 생성됩니다.' : readingError ? `## AI 풀이를 생성하지 못했어요\n원국은 정상적으로 계산되었습니다. ${readingError}` : reading);
  dailyResult.hidden = true;
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async event => {
  event.preventDefault(); error.hidden = true;
  button.disabled = true; button.firstChild.textContent = '풀이를 준비하는 중... ';
  const fields = new FormData(form);
  try {
    const birthInput = { name: fields.get('name'), date: fields.get('date'), time: fields.get('time') || null, calendar: fields.get('calendar'), leapMonth: fields.has('leapMonth') };
    const response = await fetch('/api/reading', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(birthInput) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '풀이를 불러오지 못했습니다.');
    if (JSON.stringify(currentBirthInput) !== JSON.stringify(birthInput)) {
      chatHistory = [];
      chatMessages.replaceChildren();
      document.querySelector('#chat-suggestions').hidden = false;
    }
    currentBirthInput = birthInput;
    currentSaju = data.saju;
    render(data);
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  finally { button.disabled = false; button.firstChild.textContent = '나의 사주 보기 '; }
});

dailyButton.addEventListener('click', async () => {
  if (!currentBirthInput) return;
  dailyButton.disabled = true;
  dailyButton.firstChild.textContent = '오늘의 기운을 읽는 중... ';
  try {
    const response = await fetch('/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentBirthInput) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '오늘의 운세를 불러오지 못했습니다.');
    document.querySelector('#daily-title').textContent = `${data.today.date} 오늘의 기운`;
    document.querySelector('#daily-pillar').textContent = `오늘의 일진 ${data.today.dayPillar.hangul}(${data.today.dayPillar.hanja})`;
    renderReading(document.querySelector('#daily-reading'), data.setupRequired ? '## API 키 설정이 필요해요\nOPENAI_API_KEY를 설정하고 서버를 다시 시작하면 오늘의 운세를 볼 수 있습니다.' : data.readingError ? `## AI 운세를 생성하지 못했어요\n${data.readingError}` : data.reading);
  } catch (cause) {
    document.querySelector('#daily-title').textContent = '오늘의 운세';
    document.querySelector('#daily-pillar').textContent = '';
    renderReading(document.querySelector('#daily-reading'), `## 불러오지 못했어요\n${cause.message}`);
  } finally {
    dailyResult.hidden = false;
    dailyButton.disabled = false;
    dailyButton.firstChild.textContent = '다시 보기 ';
    dailyResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
