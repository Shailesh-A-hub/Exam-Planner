# Exam – VIT AI Study Planner

A VS Code extension that acts as your personal exam coach. Give it your VIT course code, syllabus portion, and textbook — it analyses previous year question (PYQ) patterns and generates:

- **Topic frequency ranking** — what topics appear most in PYQs
- **Day-by-day study plan** — prioritised schedule across your available days
- **Predicted exam questions** — likely 16-mark / 8-mark / 2-mark questions with hints
- **Book chapter mapping** — exact chapters and page ranges to focus on

---

## Setup

### 1. Install the extension

**Option A — from source (development)**
```bash
cd exam-extension
npm install
npm run compile
```
Then press `F5` in VS Code to launch the Extension Development Host.

**Option B — install the .vsix package**
```bash
npm run package        # creates exam-1.0.0.vsix
```
In VS Code: `Extensions > ... > Install from VSIX` and select the file.

### 2. Add your Gemini API key

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
```
Exam: Set Gemini API Key
```
Enter your key from [Google AI Studio](https://aistudio.google.com/app/apikey). It is stored securely in VS Code's secret storage — never in plain text.

---

## Usage

1. Click the **Exam** icon in the activity bar (left sidebar)
2. Click **Open Study Planner** — or run `Exam: Open Study Planner` from the command palette
3. Fill in:
   - Course code (e.g. `ECE2002`)
   - Course name (e.g. `Signals and Systems`)
   - Portion (e.g. `Units 1–3`)
   - Exam type (FAT / CAT 1 / CAT 2)
   - Textbook name
   - Your VIT campus
   - Days available to study
4. Click **Generate Study Plan**

The planner fetches PYQ patterns from its knowledge of vitpapervault.in and VIT-Papers (GitHub) and returns a complete study plan in ~10 seconds.

---

## Files

```
exam-extension/
├── src/
│   ├── extension.ts       # activation, commands, sidebar provider
│   └── plannerPanel.ts    # main webview panel + Gemini API call
├── media/
│   └── sidebar-icon.svg   # activity bar icon
├── package.json           # extension manifest
├── tsconfig.json
└── README.md
```

---

## Requirements

- VS Code 1.85+
- Node.js 18+
- A Google Gemini API key (Google AI Studio — 100% Free)

---

## Extending it

Want to add more features? Ideas:
- **Serial monitor style output** — stream the study plan token by token
- **Save plans** — persist generated plans per course using `vscode.workspaceState`
- **PDF export** — use a headless PDF library to export the plan
- **Direct PaperVault scraping** — if VIT opens an API, plug it in via the `generate` command handler in `plannerPanel.ts`
