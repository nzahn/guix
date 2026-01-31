import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

type CliSummary = {
	project: string | null;
	project_version: string | null;
	guix_version: string | null;
	studio_version: string | null;
	project_name: string | null;
};

type CliGenerateResult = {
	ok: boolean;
	resource_xml?: string;
};

type CliValidateResult = {
	ok: boolean;
	errors: string[];
	warnings: string[];
};

function getOutputChannel(): vscode.OutputChannel {
	return vscode.window.createOutputChannel('GUIX Studio');
}

function getDiagnosticsCollection(): vscode.DiagnosticCollection {
	return vscode.languages.createDiagnosticCollection('guix-gxp');
}

function findCliCandidatePaths(extensionContext: vscode.ExtensionContext): string[] {
	const candidates: string[] = [];

	// 1) User override (best for local dev)
	const fromEnv = process.env.GUIX_STUDIO_CLI_PATH;
	if (fromEnv) {
		candidates.push(fromEnv);
	}

	// 2) Workspace build output (recommended during Phase 1)
	const folders = vscode.workspace.workspaceFolders ?? [];
	for (const folder of folders) {
		const root = folder.uri.fsPath;
		candidates.push(path.join(root, 'build', 'guix_studio_cli', 'guix_studio_cli'));
		candidates.push(path.join(root, 'build', 'guix_studio_cli', 'Debug', 'guix_studio_cli.exe'));
		candidates.push(path.join(root, 'build', 'guix_studio_cli', 'Release', 'guix_studio_cli.exe'));
		candidates.push(path.join(root, 'build', 'guix_studio_cli', 'guix_studio_cli.exe'));
	}

	// 3) Extension-bundled (future: ship per-platform binaries)
	// Placeholder path so we have a stable convention early.
	candidates.push(path.join(extensionContext.extensionPath, 'bin', 'guix_studio_cli'));
	candidates.push(path.join(extensionContext.extensionPath, 'bin', 'guix_studio_cli.exe'));

	return candidates;
}

async function resolveCliPath(extensionContext: vscode.ExtensionContext): Promise<string> {
	const candidates = findCliCandidatePaths(extensionContext);

	for (const candidate of candidates) {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
			return candidate;
		} catch {
			// keep trying
		}
	}

	throw new Error(
		[
			'Unable to locate `guix_studio_cli`.',
			'Build it via:',
			'  cmake -S tools/guix_studio_cli -B build/guix_studio_cli',
			'  cmake --build build/guix_studio_cli',
			'Then set `GUIX_STUDIO_CLI_PATH` or use the default build path.',
		].join('\n')
	);
}

function execFileJson<T>(exe: string, args: string[], cwd?: string): Promise<T> {
	return new Promise((resolve, reject) => {
		cp.execFile(exe, args, { cwd }, (err: cp.ExecFileException | null, stdout: string, stderr: string) => {
			if (err) {
				reject(new Error(`${err.message}\n${stderr}`.trim()));
				return;
			}
			try {
				resolve(JSON.parse(stdout) as T);
			} catch (parseErr) {
				reject(new Error(`Failed to parse CLI JSON output.\n${String(parseErr)}\nOutput:\n${stdout}`));
			}
		});
	});
}

async function pickGxpFile(): Promise<string | undefined> {
	const picked = await vscode.window.showOpenDialog({
		canSelectMany: false,
		filters: {
			'GUIX Studio Project': ['gxp'],
		},
	});
	return picked?.[0]?.fsPath;
}

async function pickOutputFolder(): Promise<string | undefined> {
	const picked = await vscode.window.showOpenDialog({
		canSelectMany: false,
		canSelectFiles: false,
		canSelectFolders: true,
		openLabel: 'Select output folder',
	});
	return picked?.[0]?.fsPath;
}

async function showProjectSummary(extensionContext: vscode.ExtensionContext, gxpPath: string): Promise<void> {
	const output = getOutputChannel();
	output.show(true);

	const cli = await resolveCliPath(extensionContext);
	output.appendLine(`Using CLI: ${cli}`);
	output.appendLine(`Project: ${gxpPath}`);

	const summary = await execFileJson<CliSummary>(cli, ['summary', '--project', gxpPath, '--json']);

	output.appendLine('---');
	output.appendLine(`project_name: ${summary.project_name ?? '<missing>'}`);
	output.appendLine(`project_version: ${summary.project_version ?? '<missing>'}`);
	output.appendLine(`guix_version: ${summary.guix_version ?? '<missing>'}`);
	output.appendLine(`studio_version: ${summary.studio_version ?? '<missing>'}`);

	void vscode.window.showInformationMessage(
		`GUIX project: ${summary.project_name ?? path.basename(gxpPath)} (v${summary.project_version ?? '?'})`
	);
}

function guessRelatedRange(document: vscode.TextDocument, needle: string): vscode.Range {
	// Best-effort: locate a related XML tag so Diagnostics can point somewhere useful.
	const idx = document.getText().indexOf(needle);
	if (idx < 0) {
		return new vscode.Range(0, 0, 0, 1);
	}
	const pos = document.positionAt(idx);
	return new vscode.Range(pos.line, 0, pos.line, Math.max(1, pos.character + needle.length));
}

async function validateProject(
	extensionContext: vscode.ExtensionContext,
	diagnostics: vscode.DiagnosticCollection,
	gxpPath: string
): Promise<void> {
	const output = getOutputChannel();
	output.show(true);

	const cli = await resolveCliPath(extensionContext);
	output.appendLine(`Using CLI: ${cli}`);
	output.appendLine(`Validate: ${gxpPath}`);

	let result: CliValidateResult;
	try {
		result = await execFileJson<CliValidateResult>(cli, ['validate', '--project', gxpPath, '--json']);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		output.appendLine('---');
		output.appendLine(message);
		void vscode.window.showErrorMessage('GUIX validate failed. See Output: GUIX Studio.');
		return;
	}

	const uri = vscode.Uri.file(gxpPath);
	let document: vscode.TextDocument | undefined;
	try {
		document = await vscode.workspace.openTextDocument(uri);
	} catch {
		// If it can't be opened (rare), we still clear/set empty diagnostics.
	}

	const diags: vscode.Diagnostic[] = [];
	for (const e of result.errors ?? []) {
		const range = document ? guessRelatedRange(document, '<project_name>') : new vscode.Range(0, 0, 0, 1);
		const d = new vscode.Diagnostic(range, e, vscode.DiagnosticSeverity.Error);
		d.source = 'guix_studio_cli';
		diags.push(d);
	}
	for (const w of result.warnings ?? []) {
		const range = document ? guessRelatedRange(document, '<project_version>') : new vscode.Range(0, 0, 0, 1);
		const d = new vscode.Diagnostic(range, w, vscode.DiagnosticSeverity.Warning);
		d.source = 'guix_studio_cli';
		diags.push(d);
	}

	diagnostics.set(uri, diags);

	if (result.ok) {
		void vscode.window.showInformationMessage('GUIX project validation: OK');
	} else {
		void vscode.window.showWarningMessage('GUIX project validation: issues found (see Problems panel).');
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const diagnostics = getDiagnosticsCollection();
	context.subscriptions.push(diagnostics);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.openProject', async () => {
			const file = await pickGxpFile();
			if (!file) return;
			await showProjectSummary(context, file);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.projectSummary', async () => {
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp = active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile();
			if (!gxp) return;
			await showProjectSummary(context, gxp);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.validateProject', async () => {
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp = active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile();
			if (!gxp) return;
			await validateProject(context, diagnostics, gxp);
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(async (doc) => {
			if (!doc.fileName.toLowerCase().endsWith('.gxp')) return;
			await validateProject(context, diagnostics, doc.fileName);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.generateOutputs', async () => {
			const output = getOutputChannel();
			output.show(true);

			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp = active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile();
			if (!gxp) return;

			const outDir = await pickOutputFolder();
			if (!outDir) return;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'GUIX: Generate Outputs',
					cancellable: false,
				},
				async () => {
					const cli = await resolveCliPath(context);
					output.appendLine(`Using CLI: ${cli}`);
					output.appendLine(`Project: ${gxp}`);
					output.appendLine(`Output folder: ${outDir}`);

					let result: CliGenerateResult;
					try {
						result = await execFileJson<CliGenerateResult>(cli, [
							'generate',
							'--project',
							gxp,
							'--output_path',
							outDir,
							'--json',
						]);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						output.appendLine('---');
						output.appendLine(message);
						void vscode.window.showErrorMessage('GUIX generation failed. See Output: GUIX Studio.');
						return;
					}

					output.appendLine('---');
					if (result.resource_xml) {
						output.appendLine(`resource_xml: ${result.resource_xml}`);
						void vscode.window.showInformationMessage(`Generated: ${path.basename(result.resource_xml)}`);
					} else {
						output.appendLine('Generation completed, but no outputs were reported.');
						void vscode.window.showInformationMessage('GUIX generation completed.');
					}
				}
			);
		})
	);
}

export function deactivate(): void {
	// no-op
}
