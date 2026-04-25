import * as vscode from 'vscode';
import { PlannerPanel } from './plannerPanel';

export function activate(context: vscode.ExtensionContext) {

  // Command: Open the study planner panel
  context.subscriptions.push(
    vscode.commands.registerCommand('exam.openPlanner', () => {
      PlannerPanel.createOrShow(context);
    })
  );

  // Command: Set Gemini API key securely
  context.subscriptions.push(
    vscode.commands.registerCommand('exam.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your Google Gemini API key',
        placeHolder: 'AIzaSy...',
        password: true,
        ignoreFocusOut: true
      });
      if (key) {
        await context.secrets.store('exam.geminiApiKey', key);
        vscode.window.showInformationMessage('Exam: Gemini API key saved securely.');
      }
    })
  );

  // Register the sidebar webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'exam.plannerView',
      new PlannerViewProvider(context)
    )
  );
}

class PlannerViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getSidebarHtml();

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'openPlanner') {
        vscode.commands.executeCommand('exam.openPlanner');
      }
    });
  }
}

function getSidebarHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); font-size: 12px; padding: 12px; color: var(--vscode-foreground); background: transparent; }
  h2 { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
  p { color: var(--vscode-descriptionForeground); line-height: 1.5; margin: 0 0 14px; }
  button { width: 100%; padding: 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .tip { background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); border-radius: 4px; padding: 8px; margin-top: 12px; font-size: 11px; line-height: 1.5; color: var(--vscode-foreground); }
</style>
</head>
<body>
<h2>Exam</h2>
<p>AI-powered VIT study planner. Enter your course, syllabus portion and book — get a full plan based on PYQ analysis.</p>
<button onclick="openPlanner()">Open Study Planner</button>
<div class="tip">
  <strong>First time?</strong><br>
  Run <code>Exam: Set Gemini API Key</code> from the command palette (Ctrl+Shift+P) to add your API key.
</div>
<script>
  const vscode = acquireVsCodeApi();
  function openPlanner() {
    vscode.postMessage({ command: 'openPlanner' });
  }
</script>
</body>
</html>`;
}

export function deactivate() {}
