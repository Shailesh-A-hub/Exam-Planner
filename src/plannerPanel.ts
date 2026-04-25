import * as vscode from 'vscode';

export class PlannerPanel {
  public static currentPanel: PlannerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PlannerPanel.currentPanel) {
      PlannerPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'examPlanner',
      'Exam – Study Planner',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    PlannerPanel.currentPanel = new PlannerPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;
    this._panel.webview.html = this._getHtml();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {

        case 'generate': {
          const apiKey = await context.secrets.get('exam.geminiApiKey')
            || vscode.workspace.getConfiguration('exam').get<string>('geminiApiKey', '');

          if (!apiKey) {
            this._panel.webview.postMessage({
              command: 'error',
              text: 'No API key found. Run "Exam: Set Gemini API Key" from the command palette (Ctrl+Shift+P).'
            });
            return;
          }

          try {
            await this._runGeneration(msg.data, apiKey);
          } catch (e: any) {
            this._panel.webview.postMessage({ command: 'error', text: e.message });
          }
          break;
        }

        case 'openSettings': {
          vscode.commands.executeCommand('workbench.action.openSettings', 'exam');
          break;
        }

        case 'setApiKey': {
          vscode.commands.executeCommand('exam.setApiKey');
          break;
        }
      }
    }, null, this._disposables);
  }

  private async _fetchCodeChefPapers(courseCode: string): Promise<string> {
    // Try multiple known CodeChef VIT paper repos
    const repos = [
      'Codechef-VIT/VIT-Papers',
      'codechefvit/vitpapervault',
      'codechefvit/VIT-Papers'
    ];
    for (const repo of repos) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,
          { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'VIT-Exam-Planner-Extension' } }
        );
        if (!res.ok) { continue; }
        const data = await res.json() as any;
        const files: string[] = (data.tree || [])
          .filter((f: any) => f.type === 'blob')
          .map((f: any) => f.path as string)
          .filter((p: string) => {
            const upper = p.toUpperCase();
            const matchesCourse = upper.includes(courseCode.toUpperCase());
            const recentYear = p.includes('2023') || p.includes('2024') || p.includes('2025');
            return matchesCourse && recentYear;
          });
        if (files.length > 0) {
          return `\n\nREAL PAPERS FOUND on CodeChef VIT GitHub (${repo}) for ${courseCode}, last 2 years:\n` +
            files.map(f => `  - ${f}`).join('\n') +
            `\n\nIMPORTANT: Use these specific paper filenames as your PRIMARY reference. ` +
            `The filenames encode year, semester, and exam type. Analyse the topics asked ` +
            `in these papers to build the frequency table and predicted questions.`;
        }
      } catch { continue; }
    }
    return ''; // fallback: AI uses its own knowledge
  }

  private async _runGeneration(data: any, apiKey: string) {
    const { courseCode, courseName, portion, examType, book, days, campus, moduleWeightage } = data;

    // Notify UI that we are fetching real papers
    this._panel.webview.postMessage({ command: 'loadMsg', text: 'Fetching real papers from CodeChef VIT GitHub…' });
    const papersContext = await this._fetchCodeChefPapers(courseCode);
    this._panel.webview.postMessage({ command: 'loadMsg', text: 'Analysing PYQ patterns with Gemini…' });

    const patternNote = 'IMPORTANT: This exam has 10 questions worth 10 marks each. ALL predicted questions must be 10-mark questions only.';
    const qType = '10-mark';

    const weightageNote = moduleWeightage && moduleWeightage.length > 0
      ? `\n\nMODULE-WISE WEIGHTAGE — follow this distribution EXACTLY when generating predicted questions:\n${moduleWeightage.map((m: any) => `  - ${m.module}: ${m.questions} question(s) x 10 marks`).join('\n')}\nThe total predicted questions must respect the above unit distribution precisely.`
      : '';

    const papersFoundNote = papersContext
      ? papersContext
      : `\n\nNo papers found on GitHub for this course code. Use your knowledge of ${courseName} PYQ patterns from vitpapervault.in and papers.codechefvit.com, restricting to 2023-2024 and 2024-2025 academic years only.`;

    const prompt = `You are an expert VIT exam coach for ECE students at VIT ${campus}. The student is preparing for:

Course: ${courseName} (${courseCode})
Exam: ${examType}
Exam Pattern: 10 questions x 10 marks each
Portion: ${portion}
Textbook: ${book}
Days available: ${days}
Campus: VIT ${campus}

${patternNote}${weightageNote}${papersFoundNote}

Based ONLY on the last 2 years of PYQ papers (2023-2024 and 2024-2025), generate a comprehensive study analysis. IGNORE papers older than 2 years.

Return ONLY a JSON object with this exact structure (no markdown, no backticks, no extra text):
{
  "papers_found": <actual number of papers found or estimated>,
  "summary": "<2 sentence exam strategy tip for 10x10 pattern based only on recent 2 year PYQ trends>",
  "topics": [
    {"name": "<topic>", "freq": <1-10>, "priority": "high|mid|low", "units": "<unit>", "marks": "<typical marks asked in this pattern>"}
  ],
  "study_plan": [
    {"day": <number>, "focus": "<main focus>", "tasks": ["<task1>", "<task2>", "<task3>"]}
  ],
  "predicted_questions": [
    {"question": "<question text>", "type": "${qType}", "topic": "<topic>", "confidence": "high|mid", "hint": "<1 line answer hint>"}
  ],
  "book_mapping": [
    {"chapter": <number>, "title": "<chapter title>", "topics_covered": ["<topic>"], "priority": "high|mid|low", "pages": "<approx range>", "key_sections": "<important sections to focus on>"}
  ]
}

Include 8-12 topics, exactly ${days} days in plan (3 tasks/day), exactly 10 predicted questions matching the exam pattern, 5-7 book chapters. Base ALL frequency and priority rankings strictly on the last 2 years of PYQs. Be specific to ${courseName} at VIT ${campus}.`;


    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const err = await response.json() as any;
      throw new Error(err?.error?.message || `API error ${response.status}`);
    }

    const result = await response.json() as any;
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      throw new Error('Could not parse AI response. Please try again.');
    }

    this._panel.webview.postMessage({ command: 'result', data: parsed });
  }

  public dispose() {
    PlannerPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Exam – Study Planner</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 20px 24px;
    max-width: 900px;
  }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
  .sub { color: var(--vscode-descriptionForeground); margin-bottom: 20px; font-size: 12px; }
  .form-card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 20px;
  }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .form-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  label { display: block; font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
  input, select {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
  }
  input:focus, select:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
  .btn {
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    font-weight: 500;
  }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); width: 100%; padding: 9px; }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .tabs { display: flex; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 14px; }
  .tab { padding: 7px 16px; font-size: 12px; cursor: pointer; border: none; background: transparent; color: var(--vscode-descriptionForeground); border-bottom: 2px solid transparent; font-family: var(--vscode-font-family); }
  .tab.active { color: var(--vscode-textLink-foreground); border-bottom-color: var(--vscode-textLink-foreground); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
  .stat { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 12px; text-align: center; }
  .stat-n { font-size: 24px; font-weight: 600; color: var(--vscode-textLink-foreground); }
  .stat-l { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .topic-row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .topic-row:last-child { border-bottom: none; }
  .bar-bg { flex: 1; height: 5px; background: var(--vscode-panel-border); border-radius: 3px; overflow: hidden; }
  .bar { height: 100%; border-radius: 3px; }
  .bar-high { background: #f14c4c; }
  .bar-mid { background: #cca700; }
  .bar-low { background: #89d185; }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 500; }
  .badge-high { background: rgba(241,76,76,0.15); color: #f14c4c; }
  .badge-mid { background: rgba(204,167,0,0.15); color: #cca700; }
  .badge-low { background: rgba(137,209,133,0.2); color: #89d185; }
  .badge-info { background: rgba(75,156,211,0.15); color: #4b9cd3; }
  .day-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 13px; margin-bottom: 8px; }
  .day-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .day-num { font-weight: 600; font-size: 13px; }
  .day-focus { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .day-task { font-size: 12px; padding: 3px 0; }
  .day-task::before { content: "▸ "; color: var(--vscode-textLink-foreground); }
  .q-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px 13px; margin-bottom: 8px; }
  .q-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .q-text { font-size: 13px; line-height: 1.55; margin-bottom: 5px; }
  .q-hint { font-size: 11px; color: var(--vscode-descriptionForeground); font-style: italic; }
  .book-row { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--vscode-panel-border); align-items: flex-start; }
  .book-row:last-child { border-bottom: none; }
  .ch-circle { width: 28px; height: 28px; border-radius: 50%; background: var(--vscode-button-background); color: var(--vscode-button-foreground); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
  .book-info { flex: 1; }
  .book-title { font-weight: 500; margin-bottom: 3px; }
  .book-topics { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
  .book-hint { font-size: 11px; color: var(--vscode-descriptionForeground); font-style: italic; }
  .summary-box { background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); border-radius: 6px; padding: 10px 13px; margin-bottom: 14px; font-size: 12px; line-height: 1.6; }
  .error-box { background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 6px; padding: 10px 13px; margin-bottom: 14px; font-size: 12px; }
  .loading { text-align: center; padding: 30px 0; color: var(--vscode-descriptionForeground); font-size: 13px; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--vscode-panel-border); border-top-color: var(--vscode-textLink-foreground); border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .hidden { display: none !important; }
  .marks-tag { font-size: 10px; color: var(--vscode-descriptionForeground); }
  .api-link { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: underline; font-size: 12px; }
  .module-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, #555); border-radius: 4px; padding: 5px 8px; }
  .mod-label { font-size: 10px; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .papers-banner { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 9px 13px; margin-bottom: 14px; font-size: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .papers-banner span { color: var(--vscode-descriptionForeground); }
  .papers-banner a { color: var(--vscode-textLink-foreground); text-decoration: none; font-weight: 500; }
  .papers-banner a:hover { text-decoration: underline; }
  .pdf-btn { margin-top: 14px; width: 100%; padding: 8px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: var(--vscode-font-family); }
  .pdf-btn:hover { opacity: 0.85; }
  @media print {
    .form-card, .papers-banner, #errorBox, #loadingBox, .pdf-btn, h1, .sub { display: none !important; }
    body { padding: 10px; background: white; color: black; }
    .stat-n { color: #1a73e8; }
    .bar-high { background: #d93025; }
    .bar-mid { background: #f9a825; }
    .bar-low { background: #34a853; }
    .tabs { display: none; }
    #tab-freq, #tab-plan, #tab-pqs, #tab-book { display: block !important; }
    .hidden { display: block !important; }
  }
</style>
</head>
<body>

<h1>Exam</h1>
<p class="sub">VIT AI Study Planner — PYQ analysis + predicted questions + day-by-day plan</p>

<div class="papers-banner">
  <span>Find VIT PYQ papers to cross-reference:</span>
  <div style="display:flex;gap:14px;">
    <a href="https://papers.codechefvit.com" target="_blank">CodeChef VIT Papers</a>
    <a href="https://vitpapervault.in" target="_blank">VIT PaperVault</a>
    <a href="https://github.com/Codechef-VIT/VIT-Papers" target="_blank">GitHub Repo</a>
  </div>
</div>

<div class="form-card">
  <div class="form-grid">
    <div><label>Course code</label><input id="courseCode" type="text" placeholder="e.g. ECE2002" /></div>
    <div><label>Course name</label><input id="courseName" type="text" placeholder="e.g. Signals and Systems" /></div>
  </div>
  <div class="form-grid">
    <div><label>Syllabus portion</label><input id="portion" type="text" placeholder="e.g. Units 1–3" /></div>
    <div><label>Exam type</label>
      <select id="examType">
        <option>FAT (Final Assessment)</option>
        <option>CAT 1</option>
        <option>CAT 2</option>
      </select>
    </div>
  </div>
  <div style="margin-bottom:10px;">
    <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <span style="font-size:11px;color:var(--vscode-descriptionForeground);">Module-wise weightage <span style="font-size:10px;opacity:0.6;">(optional — questions per unit)</span></span>
      <button class="btn btn-secondary" onclick="addModule()" style="font-size:11px;padding:3px 10px;">+ Add unit</button>
    </label>
    <div id="moduleRows"></div>
  </div>

  <div class="form-grid3">
    <div><label>Textbook</label><input id="book" type="text" placeholder="e.g. Oppenheim & Willsky" /></div>
    <div><label>Campus</label>
      <select id="campus">
        <option>Vellore</option>
        <option>Chennai</option>
        <option>Bhopal</option>
        <option>AP</option>
      </select>
    </div>
    <div><label>Days to study</label><input id="days" type="number" value="7" min="1" max="30" /></div>
  </div>
  <button class="btn btn-primary" id="generateBtn" onclick="generate()">Generate Study Plan</button>
  <div style="margin-top:10px;text-align:center">
    <span style="font-size:11px;color:var(--vscode-descriptionForeground)">No API key? </span>
    <span class="api-link" onclick="setApiKey()">Set Gemini API key</span>
  </div>
</div>

<div id="errorBox" class="error-box hidden"></div>

<div id="loadingBox" class="loading hidden">
  <div><span class="spinner"></span><span id="loadMsg">Analysing PYQ papers…</span></div>
</div>

<div id="results" class="hidden">
  <div class="stats">
    <div class="stat"><div class="stat-n" id="sN1">—</div><div class="stat-l">PYQ papers analysed</div></div>
    <div class="stat"><div class="stat-n" id="sN2">—</div><div class="stat-l">topics found</div></div>
    <div class="stat"><div class="stat-n" id="sN3">—</div><div class="stat-l">high-priority topics</div></div>
  </div>
  <div id="summaryBox" class="summary-box"></div>
  <div class="tabs">
    <button class="tab active" onclick="showTab('freq',this)">Topic frequency</button>
    <button class="tab" onclick="showTab('plan',this)">Study plan</button>
    <button class="tab" onclick="showTab('pqs',this)">Predicted Qs</button>
    <button class="tab" onclick="showTab('book',this)">Book mapping</button>
  </div>
  <div id="tab-freq"><div id="topicList"></div></div>
  <div id="tab-plan" class="hidden"><div id="planList"></div></div>
  <div id="tab-pqs" class="hidden"><div id="pqsList"></div></div>
  <div id="tab-book" class="hidden"><div id="bookList"></div></div>
  <button class="pdf-btn" onclick="window.print()">Export as PDF (File > Print > Save as PDF)</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  const loadMsgs = [
    'Fetching PYQ papers from PaperVault…',
    'Scanning question frequency…',
    'Cross-referencing syllabus…',
    'Mapping textbook chapters…',
    'Predicting exam questions…',
    'Building day-by-day plan…'
  ];
  let loadTicker;

  function showTab(name, el) {
    ['freq','plan','pqs','book'].forEach(t => document.getElementById('tab-'+t).classList.add('hidden'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-'+name).classList.remove('hidden');
    el.classList.add('active');
  }

  function setApiKey() { vscode.postMessage({ command: 'setApiKey' }); }

  let moduleCount = 0;

  function addModule() {
    moduleCount++;
    const row = document.createElement('div');
    row.className = 'module-row';
    row.id = 'mod-' + moduleCount;
    row.innerHTML = `
      <span class="mod-label">Unit</span>
      <input type="text" placeholder="e.g. Unit 1 – Microprocessor" class="mod-name" style="flex:1;" />
      <span class="mod-label">Questions</span>
      <input type="number" value="2" min="0" max="10" class="mod-qs" style="width:50px;" />
      <button onclick="removeModule(${moduleCount})" style="background:transparent;border:none;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
    `;
    document.getElementById('moduleRows').appendChild(row);
  }

  function removeModule(id) {
    const el = document.getElementById('mod-' + id);
    if (el) el.remove();
  }

  function getModuleWeightage() {
    const rows = document.querySelectorAll('.module-row');
    const result = [];
    rows.forEach(row => {
      const name = row.querySelector('.mod-name').value.trim();
      const qs = parseInt(row.querySelector('.mod-qs').value) || 0;
      if (name && qs > 0) result.push({ module: name, questions: qs });
    });
    return result;
  }

  function generate() {
    const data = {
      courseCode: document.getElementById('courseCode').value.trim(),
      courseName: document.getElementById('courseName').value.trim(),
      portion: document.getElementById('portion').value.trim(),
      examType: document.getElementById('examType').value,
      moduleWeightage: getModuleWeightage(),
      book: document.getElementById('book').value.trim(),
      campus: document.getElementById('campus').value,
      days: parseInt(document.getElementById('days').value) || 7
    };
    if (!data.courseCode || !data.courseName || !data.portion || !data.book) {
      showError('Please fill in all fields before generating.');
      return;
    }
    document.getElementById('errorBox').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('loadingBox').classList.remove('hidden');
    document.getElementById('generateBtn').disabled = true;

    let mi = 0;
    loadTicker = setInterval(() => {
      mi = (mi + 1) % loadMsgs.length;
      document.getElementById('loadMsg').textContent = loadMsgs[mi];
    }, 1200);

    vscode.postMessage({ command: 'generate', data });
  }

  function showError(msg) {
    const box = document.getElementById('errorBox');
    box.textContent = msg;
    box.classList.remove('hidden');
  }

  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.command === 'loadMsg') {
      document.getElementById('loadMsg').textContent = msg.text;
      return;
    }

    clearInterval(loadTicker);
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('generateBtn').disabled = false;

    if (msg.command === 'error') {
      showError(msg.text);
      return;
    }
    if (msg.command === 'result') {
      renderResults(msg.data);
    }
  });

  function renderResults(d) {
    const topics = d.topics || [];
    const high = topics.filter(t => t.priority === 'high').length;
    document.getElementById('sN1').textContent = d.papers_found || '—';
    document.getElementById('sN2').textContent = topics.length;
    document.getElementById('sN3').textContent = high;
    document.getElementById('summaryBox').textContent = d.summary || '';

    const maxFreq = Math.max(...topics.map(t => t.freq), 1);
    document.getElementById('topicList').innerHTML = topics.map(t => \`
      <div class="topic-row">
        <span style="min-width:180px;font-weight:\${t.priority==='high'?600:400}">\${t.name}</span>
        <div class="bar-bg"><div class="bar bar-\${t.priority}" style="width:\${Math.round(t.freq/maxFreq*100)}%"></div></div>
        <span style="min-width:24px;text-align:right;font-size:11px;color:var(--vscode-descriptionForeground)">\${t.freq}x</span>
        <span class="badge badge-\${t.priority}">\${t.priority}</span>
        <span class="marks-tag">\${t.marks || ''}</span>
      </div>\`).join('');

    document.getElementById('planList').innerHTML = (d.study_plan || []).map(p => \`
      <div class="day-card">
        <div class="day-head">
          <span class="day-num">Day \${p.day}</span>
          <span class="day-focus">\${p.focus}</span>
        </div>
        \${(p.tasks || []).map(t => \`<div class="day-task">\${t}</div>\`).join('')}
      </div>\`).join('');

    document.getElementById('pqsList').innerHTML = (d.predicted_questions || []).map(q => \`
      <div class="q-card">
        <div class="q-meta">
          <span class="badge badge-info">\${q.type}</span>
          <span class="badge badge-\${q.confidence==='high'?'high':'mid'}">\${q.confidence} chance</span>
          <span style="font-size:11px;color:var(--vscode-descriptionForeground)">\${q.topic}</span>
        </div>
        <div class="q-text">\${q.question}</div>
        <div class="q-hint">Hint: \${q.hint}</div>
      </div>\`).join('');

    document.getElementById('bookList').innerHTML = (d.book_mapping || []).map(c => \`
      <div class="book-row">
        <div class="ch-circle">\${c.chapter}</div>
        <div class="book-info">
          <div class="book-title">\${c.title} <span class="badge badge-\${c.priority}">\${c.priority}</span></div>
          <div class="book-topics">\${(c.topics_covered || []).join(', ')} &nbsp;·&nbsp; pp. \${c.pages}</div>
          <div class="book-hint">Focus: \${c.key_sections}</div>
        </div>
      </div>\`).join('');

    document.getElementById('results').classList.remove('hidden');
  }
</script>
</body>
</html>`;
  }
}
