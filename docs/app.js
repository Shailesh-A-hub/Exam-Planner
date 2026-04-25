// ── API Key management ────────────────────────────────────────────
const KEY_STORE = 'vit_planner_gemini_key';

function loadKey() {
  const k = localStorage.getItem(KEY_STORE) || '';
  if (k) {
    document.getElementById('apiKeyRow').classList.add('hidden');
    document.getElementById('keyStatus').classList.remove('hidden');
  }
  return k;
}

document.getElementById('saveKeyBtn').addEventListener('click', function () {
  const val = document.getElementById('apiKeyInput').value.trim();
  if (!val) { alert('Please paste your Gemini API key first.'); return; }
  localStorage.setItem(KEY_STORE, val);
  document.getElementById('apiKeyRow').classList.add('hidden');
  document.getElementById('keyStatus').classList.remove('hidden');
});

document.getElementById('clearKey').addEventListener('click', function () {
  localStorage.removeItem(KEY_STORE);
  document.getElementById('apiKeyInput').value = '';
  document.getElementById('apiKeyRow').classList.remove('hidden');
  document.getElementById('keyStatus').classList.add('hidden');
});

loadKey();

// ── Tabs ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var name = btn.getAttribute('data-tab');
    ['freq', 'plan', 'pqs', 'book'].forEach(function (t) {
      document.getElementById('tab-' + t).classList.add('hidden');
    });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.getElementById('tab-' + name).classList.remove('hidden');
    btn.classList.add('active');
  });
});

// ── Books ─────────────────────────────────────────────────────────
var bookCount = 1;

document.getElementById('addBookBtn').addEventListener('click', function () {
  bookCount++;
  var id = 'book-' + bookCount;
  var row = document.createElement('div');
  row.className = 'dynamic-row';
  row.id = id;

  var inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'book-input';
  inp.placeholder = 'e.g. Morris Mano — Digital Design';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rm-btn';
  btn.textContent = '✕';
  btn.setAttribute('data-remove-book', id);

  row.appendChild(inp);
  row.appendChild(btn);
  document.getElementById('bookRows').appendChild(row);
});

document.getElementById('bookRows').addEventListener('click', function (e) {
  var btn = e.target.closest('[data-remove-book]');
  if (!btn) return;
  if (document.querySelectorAll('.book-input').length <= 1) return;
  document.getElementById(btn.getAttribute('data-remove-book')).remove();
});

function getBooks() {
  return Array.from(document.querySelectorAll('.book-input'))
    .map(function (el) { return el.value.trim(); })
    .filter(function (v) { return v.length > 0; });
}

// ── Modules ───────────────────────────────────────────────────────
var moduleCount = 0;

document.getElementById('addUnitBtn').addEventListener('click', function () {
  moduleCount++;
  var id = 'mod-' + moduleCount;
  var row = document.createElement('div');
  row.className = 'dynamic-row';
  row.id = id;

  var lbl1 = document.createElement('span');
  lbl1.className = 'mod-label';
  lbl1.textContent = 'Unit';

  var nameInp = document.createElement('input');
  nameInp.type = 'text';
  nameInp.className = 'mod-name';
  nameInp.placeholder = 'e.g. Unit 1 — 8086 Architecture';
  nameInp.style.flex = '1';

  var lbl2 = document.createElement('span');
  lbl2.className = 'mod-label';
  lbl2.textContent = 'Qs';

  var qsInp = document.createElement('input');
  qsInp.type = 'number';
  qsInp.className = 'mod-qs';
  qsInp.value = '2';
  qsInp.min = '0';
  qsInp.max = '10';
  qsInp.style.width = '52px';

  var rmBtn = document.createElement('button');
  rmBtn.type = 'button';
  rmBtn.className = 'rm-btn';
  rmBtn.textContent = '✕';
  rmBtn.setAttribute('data-remove-mod', id);

  row.appendChild(lbl1);
  row.appendChild(nameInp);
  row.appendChild(lbl2);
  row.appendChild(qsInp);
  row.appendChild(rmBtn);
  document.getElementById('moduleRows').appendChild(row);
});

document.getElementById('moduleRows').addEventListener('click', function (e) {
  var btn = e.target.closest('[data-remove-mod]');
  if (!btn) return;
  document.getElementById(btn.getAttribute('data-remove-mod')).remove();
});

function getModuleWeightage() {
  var result = [];
  document.getElementById('moduleRows').querySelectorAll('.dynamic-row').forEach(function (row) {
    var n = row.querySelector('.mod-name');
    var q = row.querySelector('.mod-qs');
    if (!n || !q) return;
    var name = n.value.trim();
    var qs = parseInt(q.value) || 0;
    if (name && qs > 0) result.push({ module: name, questions: qs });
  });
  return result;
}

// ── GitHub paper fetch ────────────────────────────────────────────
async function fetchCodeChefPapers(courseCode) {
  var repos = ['Codechef-VIT/VIT-Papers', 'codechefvit/VIT-Papers'];
  for (var r of repos) {
    try {
      var res = await fetch('https://api.github.com/repos/' + r + '/git/trees/HEAD?recursive=1',
        { headers: { 'Accept': 'application/vnd.github+json' } });
      if (!res.ok) continue;
      var data = await res.json();
      var files = (data.tree || [])
        .filter(function (f) { return f.type === 'blob'; })
        .map(function (f) { return f.path; })
        .filter(function (p) {
          return p.toUpperCase().includes(courseCode.toUpperCase()) &&
            (p.includes('2023') || p.includes('2024') || p.includes('2025'));
        });
      if (files.length > 0) {
        return '\n\nREAL PAPERS FOUND on ' + r + ' for ' + courseCode + ':\n' +
          files.map(function (f) { return '  - ' + f; }).join('\n') +
          '\n\nUse these paper filenames as PRIMARY reference for topic frequency analysis.';
      }
    } catch (e) { continue; }
  }
  return '';
}

// ── Generate ──────────────────────────────────────────────────────
var loadMsgs = [
  'Fetching papers from CodeChef VIT GitHub...',
  'Scanning question frequency...',
  'Cross-referencing syllabus...',
  'Predicting exam questions...',
  'Building day-by-day plan...'
];
var loadTicker;

document.getElementById('generateBtn').addEventListener('click', generate);

async function generate() {
  var apiKey = localStorage.getItem(KEY_STORE) || '';
  if (!apiKey) {
    showError('Please save your Gemini API key first (click the key field above).');
    return;
  }
  var books = getBooks();
  var courseCode = document.getElementById('courseCode').value.trim();
  var courseName = document.getElementById('courseName').value.trim();
  var portion = document.getElementById('portion').value.trim();
  var examType = document.getElementById('examType').value;
  var campus = document.getElementById('campus').value;
  var days = parseInt(document.getElementById('days').value) || 7;
  var moduleWeightage = getModuleWeightage();

  if (!courseCode || !courseName || !portion || books.length === 0) {
    showError('Please fill in Course Code, Course Name, Portion, and at least one Reference Book.');
    return;
  }

  document.getElementById('errorBox').classList.add('hidden');
  document.getElementById('results').classList.add('hidden');
  document.getElementById('loadingBox').classList.remove('hidden');
  document.getElementById('generateBtn').disabled = true;

  var mi = 0;
  loadTicker = setInterval(function () {
    mi = (mi + 1) % loadMsgs.length;
    document.getElementById('loadMsg').textContent = loadMsgs[mi];
  }, 1300);

  document.getElementById('loadMsg').textContent = 'Fetching papers from CodeChef VIT GitHub...';

  try {
    var papersContext = await fetchCodeChefPapers(courseCode);
    document.getElementById('loadMsg').textContent = 'Analysing PYQ patterns with Gemini...';

    var weightageNote = moduleWeightage.length > 0
      ? '\n\nMODULE-WISE WEIGHTAGE (follow exactly):\n' +
        moduleWeightage.map(function (m) { return '  - ' + m.module + ': ' + m.questions + ' question(s) x 10 marks'; }).join('\n')
      : '';

    var papersNote = papersContext ||
      '\n\nNo papers found on GitHub. Use your knowledge of ' + courseName +
      ' PYQ patterns from papers.codechefvit.com, restricting to 2023-2025 only.';

    // VIT ECE official syllabus reference — keeps AI on the correct topics/languages
    var syllabusNote = '\n\nIMPORTANT SYLLABUS CONSTRAINT: Refer to the official VIT ECE syllabus at ' +
      'https://vit.ac.in/wp-content/uploads/2024/05/AY_2022-23_BEC.pdf for the exact topics, ' +
      'units, and programming languages for ECE courses. For example, BECE204L (Microprocessors and ' +
      'Microcontrollers) covers ONLY 8085/8086 Assembly Language programming — do NOT include ' +
      'Embedded C or ARM unless explicitly listed in the syllabus for this course code. ' +
      'Always cross-check topics against the official VIT syllabus PDF before generating questions.';

    var prompt = 'You are an expert VIT exam coach. The student is preparing for:\n\n' +
      'Course: ' + courseName + ' (' + courseCode + ')\n' +
      'Exam: ' + examType + '\n' +
      'Exam Pattern: 10 questions x 10 marks each\n' +
      'Portion: ' + portion + '\n' +
      'Reference Books: ' + books.join(', ') + '\n' +
      'Days available: ' + days + '\n' +
      'Campus: VIT ' + campus + '\n\n' +
      'IMPORTANT: ALL predicted questions must be 10-mark questions only.' +
      syllabusNote + weightageNote + papersNote + '\n\n' +
      'Based ONLY on the last 2 years of PYQ papers (2023-2024 and 2024-2025). IGNORE older papers.\n\n' +
      'Return ONLY a JSON object (no markdown, no backticks):\n' +
      '{"papers_found":<number>,"summary":"<2 sentence strategy>",' +
      '"topics":[{"name":"<topic>","freq":<1-10>,"priority":"high|mid|low","units":"<unit>","marks":"<marks>"}],' +
      '"study_plan":[{"day":<n>,"focus":"<focus>","tasks":["<t1>","<t2>","<t3>"]}],' +
      '"predicted_questions":[{"question":"<q>","type":"10-mark","topic":"<topic>","confidence":"high|mid","hint":"<hint>"}],' +
      '"book_mapping":[{"chapter":<n>,"title":"<title>","topics_covered":["<t>"],"priority":"high|mid|low","pages":"<pp>","key_sections":"<s>"}]}\n\n' +
      'Include 8-12 topics, exactly ' + days + ' days (3 tasks/day), exactly 10 predicted questions, 5-7 book chapters.';

    var res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    if (!res.ok) {
      var err = await res.json();
      throw new Error(err?.error?.message || 'API error ' + res.status);
    }

    var result = await res.json();
    var raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    var parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch (e) {
      throw new Error('Could not parse AI response. Please try again.');
    }

    renderResults(parsed);
  } catch (e) {
    showError(e.message || 'Something went wrong. Please try again.');
  } finally {
    clearInterval(loadTicker);
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('generateBtn').disabled = false;
  }
}

function showError(msg) {
  var box = document.getElementById('errorBox');
  box.textContent = msg;
  box.classList.remove('hidden');
}

// ── Render ────────────────────────────────────────────────────────
function renderResults(d) {
  var topics = d.topics || [];
  var high = topics.filter(function (t) { return t.priority === 'high'; }).length;
  document.getElementById('sN1').textContent = d.papers_found || '—';
  document.getElementById('sN2').textContent = topics.length;
  document.getElementById('sN3').textContent = high;
  document.getElementById('summaryBox').textContent = d.summary || '';

  var maxFreq = Math.max.apply(null, topics.map(function (t) { return t.freq; }).concat([1]));

  document.getElementById('topicList').innerHTML = topics.map(function (t) {
    return '<div class="topic-row">' +
      '<span class="t-name" style="font-weight:' + (t.priority === 'high' ? 600 : 400) + '">' + esc(t.name) + '</span>' +
      '<div class="bar-bg"><div class="bar bar-' + t.priority + '" style="width:' + Math.round(t.freq / maxFreq * 100) + '%"></div></div>' +
      '<span class="t-freq">' + t.freq + 'x</span>' +
      '<span class="badge2 b-' + t.priority + '">' + t.priority + '</span>' +
      '<span class="t-marks">' + esc(t.marks || '') + '</span>' +
      '</div>';
  }).join('');

  document.getElementById('planList').innerHTML = (d.study_plan || []).map(function (p) {
    return '<div class="day-card">' +
      '<div class="day-head"><span class="day-num">Day ' + p.day + '</span><span class="day-focus">' + esc(p.focus) + '</span></div>' +
      (p.tasks || []).map(function (t) { return '<div class="day-task">' + esc(t) + '</div>'; }).join('') +
      '</div>';
  }).join('');

  // Store courseName globally so answerQuestion can use it
  window._currentCourse = courseName + ' (' + courseCode + ')';

  var qIdx = 0;
  document.getElementById('pqsList').innerHTML = (d.predicted_questions || []).map(function (q) {
    var idx = qIdx++;
    return '<div class="q-card" id="qcard-' + idx + '">' +
      '<div class="q-meta">' +
      '<span class="badge2 b-info">' + esc(q.type) + '</span>' +
      '<span class="badge2 b-' + (q.confidence === 'high' ? 'high' : 'mid') + '">' + esc(q.confidence) + ' chance</span>' +
      '<span style="font-size:11px;color:var(--muted)">' + esc(q.topic) + '</span>' +
      '<button type="button" class="gemini-btn" data-q-idx="' + idx + '" title="Ask Gemini to answer this question">✨ Ask Gemini</button>' +
      '</div>' +
      '<div class="q-text">' + esc(q.question) + '</div>' +
      '<div class="q-hint">Hint: ' + esc(q.hint) + '</div>' +
      '<div class="q-answer hidden" id="qans-' + idx + '"></div>' +
      '</div>';
  }).join('');

  // Store questions for answer lookup
  window._currentQuestions = d.predicted_questions || [];

  // Event delegation for Gemini answer buttons
  document.getElementById('pqsList').addEventListener('click', function (e) {
    var btn = e.target.closest('.gemini-btn');
    if (!btn) return;
    var idx = parseInt(btn.getAttribute('data-q-idx'));
    answerQuestion(idx, btn);
  });

  document.getElementById('bookList').innerHTML = (d.book_mapping || []).map(function (c) {
    return '<div class="book-row">' +
      '<div class="ch-circle">' + c.chapter + '</div>' +
      '<div class="book-info">' +
      '<div class="book-title">' + esc(c.title) + ' <span class="badge2 b-' + c.priority + '">' + c.priority + '</span></div>' +
      '<div class="book-topics">' + esc((c.topics_covered || []).join(', ')) + ' &nbsp;·&nbsp; pp. ' + esc(c.pages) + '</div>' +
      '<div class="book-hint">Focus: ' + esc(c.key_sections) + '</div>' +
      '</div></div>';
  }).join('');

  document.getElementById('results').classList.remove('hidden');
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Gemini Answer ─────────────────────────────────────────────────
async function answerQuestion(idx, btn) {
  var apiKey = localStorage.getItem(KEY_STORE) || '';
  if (!apiKey) { showError('API key not set.'); return; }

  var q = (window._currentQuestions || [])[idx];
  if (!q) return;

  var ansBox = document.getElementById('qans-' + idx);
  if (!ansBox) return;

  // Toggle — if already showing answer, hide it
  if (!ansBox.classList.contains('hidden') && ansBox.textContent) {
    ansBox.classList.add('hidden');
    btn.textContent = '✨ Ask Gemini';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Thinking...';
  ansBox.classList.remove('hidden');
  ansBox.innerHTML = '<div class="ans-loading">Generating model answer...</div>';

  var course = window._currentCourse || 'VIT exam';
  var prompt = 'You are a VIT university exam expert. Write a complete, detailed model answer for this 10-mark exam question from ' + course + ':\n\n' +
    'Question: ' + q.question + '\n\n' +
    'Requirements:\n' +
    '- Write a proper 10-mark answer (aim for ~400-600 words or appropriate length)\n' +
    '- Use clear headings/subheadings where needed\n' +
    '- Include diagrams described in text if applicable (e.g. "[Block Diagram: CPU connected to Memory..."]\n' +
    '- For programming questions, write complete correct code with explanation\n' +
    '- For Assembly language questions, use 8085/8086 Assembly ONLY — no C code unless specifically asked\n' +
    '- Be precise and exam-ready. Format for readability.';

  try {
    var res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      }
    );
    if (!res.ok) { var e = await res.json(); throw new Error(e?.error?.message || 'API error'); }
    var result = await res.json();
    var text = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer generated.';
    // Convert markdown-like formatting to HTML
    var html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^#{1,3}\s+(.+)$/gm, '<div class="ans-heading">$1</div>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    ansBox.innerHTML = '<div class="ans-body">' + html + '</div>';
    btn.textContent = '✨ Hide Answer';
  } catch (err) {
    ansBox.innerHTML = '<div class="ans-error">Error: ' + esc(err.message) + '</div>';
    btn.textContent = '✨ Ask Gemini';
  } finally {
    btn.disabled = false;
  }
}
