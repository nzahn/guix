import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

import { GxpDesignerEditorProvider } from './gxpDesignerEditor';

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
	project_name?: string;
	outputs?: Array<{ kind: string; path: string }>;
};

type GenerateOptions = {
	generateResource: boolean;
	resourceFilename?: string;
	generateSpecification: boolean;
	specFilename?: string;
	generateBinary: boolean;
	bigEndian: boolean;
	noResHeader: boolean;
};

type CliValidateResult = {
	ok: boolean;
	errors: string[];
	warnings: string[];
};

type CliMigrateResult = {
	ok: boolean;
	project?: string;
	output?: string;
	warnings?: string[];
	changes?: string[];
	error?: string;
};

type CliSource = 'config' | 'env' | 'workspace' | 'bundled' | 'path';
type ResolvedCli = { path: string; source: CliSource; detail?: string };

let outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('GUIX Studio');
	}
	return outputChannel;
}

let diagnosticsCollection: vscode.DiagnosticCollection | undefined;
function getDiagnosticsCollection(): vscode.DiagnosticCollection {
	if (!diagnosticsCollection) {
		diagnosticsCollection = vscode.languages.createDiagnosticCollection('guix-gxp');
	}
	return diagnosticsCollection;
}

let generateDiagnosticsCollection: vscode.DiagnosticCollection | undefined;
function getGenerateDiagnosticsCollection(): vscode.DiagnosticCollection {
	if (!generateDiagnosticsCollection) {
		generateDiagnosticsCollection = vscode.languages.createDiagnosticCollection('guix-gxp-generate');
	}
	return generateDiagnosticsCollection;
}

class GuixProjectItem extends vscode.TreeItem {
	constructor(public readonly gxpPath: string) {
		super(path.basename(gxpPath), vscode.TreeItemCollapsibleState.None);
		this.tooltip = gxpPath;
		this.resourceUri = vscode.Uri.file(gxpPath);
		this.contextValue = 'guixGxp';
		this.command = {
			command: 'vscode.open',
			title: 'Open Project',
			arguments: [vscode.Uri.file(gxpPath)],
		};
	}
}

class GuixProjectsProvider implements vscode.TreeDataProvider<GuixProjectItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<GuixProjectItem | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: GuixProjectItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<GuixProjectItem[]> {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return [];
		}

		// Find .gxp projects across the workspace.
		const uris = await vscode.workspace.findFiles('**/*.gxp', '**/{build,.git,node_modules}/**');
		return uris.map((u) => new GuixProjectItem(u.fsPath));
	}
}

function findCliCandidateSpecs(extensionContext: vscode.ExtensionContext): Array<{ candidate: string; source: CliSource }> {
	const candidates: Array<{ candidate: string; source: CliSource }> = [];

	const configured = vscode.workspace.getConfiguration('guixStudio').get<string>('cli.path');
	if (configured && configured.trim()) {
		candidates.push({ candidate: configured.trim(), source: 'config' });
	}

	// 1) User override (best for local dev)
	const fromEnv = process.env.GUIX_STUDIO_CLI_PATH;
	if (fromEnv) {
		candidates.push({ candidate: fromEnv, source: 'env' });
	}

	// 2) Workspace build output (recommended during Phase 1)
	const folders = vscode.workspace.workspaceFolders ?? [];
	for (const folder of folders) {
		const root = folder.uri.fsPath;

		// Current recommended build location (repo-local)
		candidates.push({ candidate: path.join(root, 'tools', 'guix_studio_cli', 'build', 'guix_studio_cli'), source: 'workspace' });
		candidates.push({ candidate: path.join(root, 'tools', 'guix_studio_cli', 'build', 'Debug', 'guix_studio_cli.exe'), source: 'workspace' });
		candidates.push({ candidate: path.join(root, 'tools', 'guix_studio_cli', 'build', 'Release', 'guix_studio_cli.exe'), source: 'workspace' });
		candidates.push({ candidate: path.join(root, 'tools', 'guix_studio_cli', 'build', 'guix_studio_cli.exe'), source: 'workspace' });

		// Alternative out-of-source build location (from older docs)
		candidates.push({ candidate: path.join(root, 'build', 'guix_studio_cli', 'guix_studio_cli'), source: 'workspace' });
		candidates.push({ candidate: path.join(root, 'build', 'guix_studio_cli', 'Debug', 'guix_studio_cli.exe'), source: 'workspace' });
		candidates.push({ candidate: path.join(root, 'build', 'guix_studio_cli', 'Release', 'guix_studio_cli.exe'), source: 'workspace' });
		candidates.push({ candidate: path.join(root, 'build', 'guix_studio_cli', 'guix_studio_cli.exe'), source: 'workspace' });
	}

	// 3) Extension-bundled (future: ship per-platform binaries)
	// Conventions:
	// - bin/guix_studio_cli
	// - bin/<platform>/guix_studio_cli
	// - bin/<platform>-<arch>/guix_studio_cli
	const binRoot = path.join(extensionContext.extensionPath, 'bin');
	const exeName = process.platform === 'win32' ? 'guix_studio_cli.exe' : 'guix_studio_cli';
	candidates.push({ candidate: path.join(binRoot, exeName), source: 'bundled' });
	candidates.push({ candidate: path.join(binRoot, process.platform, exeName), source: 'bundled' });
	candidates.push({ candidate: path.join(binRoot, `${process.platform}-${process.arch}`, exeName), source: 'bundled' });

	return candidates;
}

function hasPathSeparator(value: string): boolean {
	return value.includes('/') || value.includes('\\');
}

function execFileText(exe: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		cp.execFile(exe, args, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`${err.message}\n${stderr}`.trim()));
				return;
			}
			resolve(String(stdout ?? '').trim());
		});
	});
}

async function findCliOnPath(): Promise<string | undefined> {
	try {
		if (process.platform === 'win32') {
			const out = await execFileText('where', ['guix_studio_cli.exe']);
			const first = out.split(/\r?\n/).find((l) => l.trim().length > 0);
			return first?.trim();
		}
		const out = await execFileText('which', ['guix_studio_cli']);
		return out.trim() || undefined;
	} catch {
		return undefined;
	}
}

async function resolveCliPath(extensionContext: vscode.ExtensionContext): Promise<ResolvedCli> {
	const candidates = findCliCandidateSpecs(extensionContext);

	for (const spec of candidates) {
		const candidate = spec.candidate;
		// If the user configured a bare name (no path separators), resolve via PATH.
		if (!hasPathSeparator(candidate)) {
			const fromPath = await findCliOnPath();
			if (fromPath) {
				return { path: fromPath, source: spec.source, detail: 'via PATH' };
			}
			continue;
		}
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
			return { path: candidate, source: spec.source };
		} catch {
			// keep trying
		}
	}

	const fromPath = await findCliOnPath();
	if (fromPath) return { path: fromPath, source: 'path' };

	throw new Error(
		[
			'Unable to locate `guix_studio_cli`.',
			'',
			'Options:',
			'1) Run "GUIX: Select CLI Path" and point at a built binary.',
			'2) Set `guixStudio.cli.path` in Settings.',
			'3) Set `GUIX_STUDIO_CLI_PATH` env var.',
			'4) Build it (repo root):',
			'   cmake -S tools/guix_studio_cli -B tools/guix_studio_cli/build',
			'   cmake --build tools/guix_studio_cli/build',
		].join('\n')
	);
}

let missingCliNotified = false;
async function resolveCliPathSafe(
	extensionContext: vscode.ExtensionContext,
	interactive: boolean,
	notifyOnMissing: boolean = true
): Promise<ResolvedCli | undefined> {
	try {
		return await resolveCliPath(extensionContext);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const output = getOutputChannel();
		output.appendLine('---');
		output.appendLine(message);

		if (!interactive) {
			if (notifyOnMissing && !missingCliNotified) {
				missingCliNotified = true;
				void vscode.window.showWarningMessage('GUIX Studio CLI not configured. Validation skipped.');
			}
			return undefined;
		}

		const choice = await vscode.window.showErrorMessage(
			'GUIX Studio CLI not found. Configure `guixStudio.cli.path`, build it, or bundle a prebuilt binary.',
			'Select CLI Path',
			'Build CLI',
			'Open Settings'
		);
		if (choice === 'Select CLI Path') {
			await vscode.commands.executeCommand('guix.selectCliPath');
		} else if (choice === 'Build CLI') {
			await vscode.commands.executeCommand('guix.buildCli');
		} else if (choice === 'Open Settings') {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'guixStudio.cli.path');
		}
		return undefined;
	}
}

function buildCliCandidatePathsForWorkspace(root: string): string[] {
	const candidates: string[] = [];
	// Repo-local build (recommended)
	candidates.push(path.join(root, 'tools', 'guix_studio_cli', 'build', 'guix_studio_cli'));
	candidates.push(path.join(root, 'tools', 'guix_studio_cli', 'build', 'guix_studio_cli.exe'));
	// Multi-config generators (Windows)
	candidates.push(path.join(root, 'tools', 'guix_studio_cli', 'build', 'Debug', 'guix_studio_cli.exe'));
	candidates.push(path.join(root, 'tools', 'guix_studio_cli', 'build', 'Release', 'guix_studio_cli.exe'));
	// Alternative out-of-source build
	candidates.push(path.join(root, 'build', 'guix_studio_cli', 'guix_studio_cli'));
	candidates.push(path.join(root, 'build', 'guix_studio_cli', 'guix_studio_cli.exe'));
	candidates.push(path.join(root, 'build', 'guix_studio_cli', 'Debug', 'guix_studio_cli.exe'));
	candidates.push(path.join(root, 'build', 'guix_studio_cli', 'Release', 'guix_studio_cli.exe'));
	return candidates;
}

function execFileStreaming(
	exe: string,
	args: string[],
	cwd: string,
	onLine: (line: string) => void
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = cp.spawn(exe, args, { cwd, shell: false });
		child.stdout.on('data', (d) => onLine(String(d)));
		child.stderr.on('data', (d) => onLine(String(d)));
		child.on('error', (err) => reject(err));
		child.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${exe} exited with code ${code}`));
		});
	});
}

async function buildCliInWorkspace(extensionContext: vscode.ExtensionContext): Promise<void> {
	const output = getOutputChannel();
	output.show(true);

	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		void vscode.window.showErrorMessage('No workspace folder is open.');
		return;
	}
	const root = folders[0].uri.fsPath;

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'GUIX: Building CLI', cancellable: false },
		async () => {
			output.appendLine('---');
			output.appendLine(`Workspace: ${root}`);
			output.appendLine('Running CMake configure + build for tools/guix_studio_cli...');

			try {
				await execFileStreaming('cmake', ['-S', 'tools/guix_studio_cli', '-B', 'tools/guix_studio_cli/build'], root, (l) => {
					for (const line of l.split(/\r?\n/)) {
						if (line.trim()) output.appendLine(line);
					}
				});
				await execFileStreaming('cmake', ['--build', 'tools/guix_studio_cli/build'], root, (l) => {
					for (const line of l.split(/\r?\n/)) {
						if (line.trim()) output.appendLine(line);
					}
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				output.appendLine('---');
				output.appendLine(message);
				void vscode.window.showErrorMessage('Failed to build guix_studio_cli. See Output: GUIX Studio.');
				return;
			}

			// Try to locate the built binary and set it as the configured path.
			for (const candidate of buildCliCandidatePathsForWorkspace(root)) {
				try {
					await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
					await vscode.workspace
						.getConfiguration('guixStudio')
						.update('cli.path', candidate, vscode.ConfigurationTarget.Workspace);
					output.appendLine('---');
					output.appendLine(`CLI built: ${candidate}`);
					void vscode.window.showInformationMessage('GUIX CLI built and configured.');
					return;
				} catch {
					// keep searching
				}
			}

			output.appendLine('---');
			output.appendLine('Build succeeded but CLI binary was not found in expected locations.');
			void vscode.window.showWarningMessage('Build succeeded, but CLI path could not be auto-detected. Use “GUIX: Select CLI Path”.');
		}
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

async function readJsonFromUri(uri: vscode.Uri): Promise<any | undefined> {
	try {
		const data = await vscode.workspace.fs.readFile(uri);
		const text = new TextDecoder('utf-8').decode(data);
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

async function writeJsonToUri(uri: vscode.Uri, value: any): Promise<void> {
	const text = JSON.stringify(value, null, 2) + '\n';
	const data = new TextEncoder().encode(text);
	await vscode.workspace.fs.writeFile(uri, data);
}

function isObject(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null;
}

async function addVsCodeTasks(): Promise<void> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		void vscode.window.showErrorMessage('No workspace folder is open.');
		return;
	}

	const folder = folders[0];
	const vscodeDir = vscode.Uri.joinPath(folder.uri, '.vscode');
	const tasksUri = vscode.Uri.joinPath(vscodeDir, 'tasks.json');

	const choice = await vscode.window.showInformationMessage(
		'Add GUIX Studio tasks to .vscode/tasks.json? (validate/generate/export-resource-xml)',
		{ modal: true },
		'Add'
	);
	if (choice !== 'Add') return;

	await vscode.workspace.fs.createDirectory(vscodeDir);

	const existing = await readJsonFromUri(tasksUri);
	const root: any = isObject(existing) ? existing : { version: '2.0.0', tasks: [] };
	if (!Array.isArray(root.tasks)) root.tasks = [];
	if (!root.version) root.version = '2.0.0';

	const cliCommand = '${config:guixStudio.cli.path}';
	const configuredOut = vscode.workspace.getConfiguration('guixStudio').get<string>('outputPath');
	const outDir = configuredOut && configuredOut.trim() ? '${config:guixStudio.outputPath}' : '${workspaceFolder}/guix_studio_out';
	const newTasks = [
		{
			label: 'GUIX: Validate active .gxp',
			type: 'shell',
			command: cliCommand,
			args: ['validate', '--project', '${file}', '--json'],
			problemMatcher: [],
			presentation: { reveal: 'always', panel: 'dedicated' },
		},
		{
			label: 'GUIX: Export resource XML (active .gxp)',
			type: 'shell',
			command: cliCommand,
			args: ['export-resource-xml', '-p', '${file}', '--output_path', outDir, '--json'],
			problemMatcher: [],
			presentation: { reveal: 'always', panel: 'dedicated' },
		},
		{
			label: 'GUIX: Generate outputs (active .gxp)',
			type: 'shell',
			command: cliCommand,
			args: ['generate', '-p', '${file}', '--output_path', outDir, '--json'],
			problemMatcher: [],
			presentation: { reveal: 'always', panel: 'dedicated' },
		},
	];

	const existingLabels = new Set<string>(root.tasks.map((t: any) => (isObject(t) ? t.label : undefined)).filter(Boolean));
	let added = 0;
	for (const t of newTasks) {
		if (existingLabels.has(t.label)) continue;
		root.tasks.push(t);
		existingLabels.add(t.label);
		added++;
	}

	await writeJsonToUri(tasksUri, root);
	void vscode.window.showInformationMessage(
		added > 0
			? `Added ${added} GUIX task(s) to .vscode/tasks.json.`
			: 'GUIX tasks already present in .vscode/tasks.json.'
	);
	void vscode.commands.executeCommand('vscode.open', tasksUri);
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

async function pickResourceXmlFile(): Promise<string | undefined> {
	const picked = await vscode.window.showOpenDialog({
		canSelectMany: false,
		filters: {
			'Resource Project XML': ['xml'],
		},
	});
	return picked?.[0]?.fsPath;
}

async function pickGenerateInputPath(): Promise<{ kind: 'gxp'; path: string } | { kind: 'xml'; path: string } | undefined> {
	const choice = await vscode.window.showQuickPick(
		[
			{ label: 'GUIX Studio Project (.gxp)', value: 'gxp' },
			{ label: 'Resource Project XML (.xml)', value: 'xml' },
		],
		{ title: 'GUIX: Select input type' }
	);
	if (!choice) return undefined;

	if (choice.value === 'gxp') {
		const active = vscode.window.activeTextEditor?.document?.fileName;
		const gxp = active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile();
		if (!gxp) return undefined;
		return { kind: 'gxp', path: gxp };
	}

	const xml = await pickResourceXmlFile();
	if (!xml) return undefined;
	return { kind: 'xml', path: xml };
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

function resolveConfiguredOutputPath(): string | undefined {
	const configured = vscode.workspace.getConfiguration('guixStudio').get<string>('outputPath');
	if (!configured || !configured.trim()) return undefined;

	const value = configured.trim();
	if (path.isAbsolute(value)) return value;

	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) return undefined;
	return path.join(folders[0].uri.fsPath, value);
}

async function resolveOutputFolder(): Promise<string | undefined> {
	const configured = resolveConfiguredOutputPath();
	if (configured) return configured;
	return await pickOutputFolder();
}

async function resolveOutputFolderInteractive(): Promise<string | undefined> {
	const configured = resolveConfiguredOutputPath();
	if (configured) return configured;

	const picked = await pickOutputFolder();
	if (!picked) return undefined;

	const choice = await vscode.window.showInformationMessage(
		'Use this folder as the default GUIX output path?',
		'Set as default',
		'Just once'
	);
	if (choice === 'Set as default') {
		const folders = vscode.workspace.workspaceFolders;
		if (folders && folders.length > 0) {
			const root = folders[0].uri.fsPath;
			const rel = path.relative(root, picked);
			const toSave = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : picked;
			await vscode.workspace
				.getConfiguration('guixStudio')
				.update('outputPath', toSave, vscode.ConfigurationTarget.Workspace);
		}
	}
	return picked;
}

async function ensureDirectoryExists(fsPath: string): Promise<void> {
	try {
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(fsPath));
	} catch {
		// best-effort
	}
}

async function quickGenerateGxp(
	extensionContext: vscode.ExtensionContext,
	gxpPath: string,
	interactive: boolean
): Promise<void> {
	const output = getOutputChannel();
	output.show(true);
	const genDiagnostics = getGenerateDiagnosticsCollection();

	const resolvedCli = await resolveCliPathSafe(extensionContext, interactive);
	if (!resolvedCli) return;
	const cli = resolvedCli.path;

	const outDir = resolveConfiguredOutputPath();
	if (!outDir) {
		if (interactive) {
			void vscode.window.showWarningMessage(
				'Quick Generate requires `guixStudio.outputPath` (set it in Settings), or use “GUIX: Generate Outputs” to pick a folder.'
			);
		}
		return;
	}
	await ensureDirectoryExists(outDir);

	output.appendLine(`Using CLI: ${cli} (${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''})`);
	output.appendLine(`Quick Generate: ${gxpPath}`);
	output.appendLine(`Output folder: ${outDir}`);

	let result: CliGenerateResult;
	try {
		result = await execFileJson<CliGenerateResult>(cli, ['generate', '-p', gxpPath, '--output_path', outDir, '--json']);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		output.appendLine('---');
		output.appendLine(message);
		const uri = vscode.Uri.file(gxpPath);
		const document = await vscode.workspace.openTextDocument(uri);
		const range = guessRelatedRange(document, '<project_name>');
		const d = new vscode.Diagnostic(range, `Generate failed: ${message}`, vscode.DiagnosticSeverity.Error);
		d.source = 'guix_studio_cli';
		genDiagnostics.set(uri, [d]);
		if (interactive) {
			void vscode.window.showErrorMessage('GUIX quick generate failed. See Output: GUIX Studio.');
		}
		return;
	}

	if (!result.ok) {
		output.appendLine('---');
		output.appendLine('Generation reported ok=false');
		const uri = vscode.Uri.file(gxpPath);
		const document = await vscode.workspace.openTextDocument(uri);
		const range = guessRelatedRange(document, '<project_name>');
		const d = new vscode.Diagnostic(range, 'Generate failed (ok=false). See Output: GUIX Studio.', vscode.DiagnosticSeverity.Error);
		d.source = 'guix_studio_cli';
		genDiagnostics.set(uri, [d]);
		if (interactive) {
			void vscode.window.showErrorMessage('GUIX quick generate failed. See Output: GUIX Studio.');
		}
		return;
	}

	// Clear generate diagnostics on success.
	genDiagnostics.set(vscode.Uri.file(gxpPath), []);

	const outputs = result.outputs ?? [];
	output.appendLine('---');
	if (outputs.length > 0) {
		for (const o of outputs) {
			output.appendLine(`${o.kind}: ${o.path}`);
		}
		if (interactive) {
			void vscode.window.showInformationMessage(`GUIX quick generate completed (${outputs.length} outputs).`);
		}
		return;
	}
	if (result.resource_xml) {
		output.appendLine(`resource_xml: ${result.resource_xml}`);
		if (interactive) {
			void vscode.window.showInformationMessage(`Generated: ${path.basename(result.resource_xml)}`);
		}
		return;
	}
	if (interactive) {
		void vscode.window.showInformationMessage('GUIX quick generate completed.');
	}
}

async function migrateProject(
	extensionContext: vscode.ExtensionContext,
	diagnostics: vscode.DiagnosticCollection,
	gxpPath: string
): Promise<void> {
	const output = getOutputChannel();
	output.show(true);

	const choice = await vscode.window.showQuickPick(
		[
			{
				label: 'Create migrated copy',
				detail: 'Writes <project>.migrated.gxp (recommended)',
				value: 'copy',
			},
			{
				label: 'Migrate in place',
				detail: 'Overwrites the existing .gxp file',
				value: 'inPlace',
			},
		],
		{ title: 'GUIX: Migrate Project' }
	);
	if (!choice) return;

	const resolvedCli = await resolveCliPathSafe(extensionContext, true);
	if (!resolvedCli) return;
	const cli = resolvedCli.path;

	let args: string[] = ['migrate', '-p', gxpPath, '--json'];
	let outPath: string | undefined;

	if (choice.value === 'inPlace') {
		args.push('--in-place');
		outPath = gxpPath;
	} else {
		const inUri = vscode.Uri.file(gxpPath);
		const defaultOutName = `${path.basename(gxpPath, path.extname(gxpPath))}.migrated.gxp`;
		const defaultOutUri = vscode.Uri.joinPath(inUri, '..', defaultOutName);
		const picked = await vscode.window.showSaveDialog({
			title: 'Save migrated project as…',
			filters: { 'GUIX Studio Project': ['gxp'] },
			defaultUri: defaultOutUri,
		});
		if (!picked) return;
		outPath = picked.fsPath;
		args.push('--output', outPath);
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'GUIX: Migrating Project',
			cancellable: false,
		},
		async () => {
			output.appendLine(`Using CLI: ${cli} (${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''})`);
			output.appendLine(`Project: ${gxpPath}`);
			output.appendLine(`Mode: ${choice.value === 'inPlace' ? 'in-place' : 'copy'}`);

			let result: CliMigrateResult;
			try {
				result = await execFileJson<CliMigrateResult>(cli, args);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				output.appendLine('---');
				output.appendLine(message);
				void vscode.window.showErrorMessage('GUIX migration failed. See Output: GUIX Studio.');
				return;
			}

			output.appendLine('---');
			if (!result.ok) {
				output.appendLine(result.error ?? 'Migration failed');
				void vscode.window.showErrorMessage('GUIX migration failed. See Output: GUIX Studio.');
				return;
			}

			for (const c of result.changes ?? []) {
				output.appendLine(`change: ${c}`);
			}
			for (const w of result.warnings ?? []) {
				output.appendLine(`warning: ${w}`);
			}

			if (outPath) {
				void vscode.window.showInformationMessage(`Migrated project written: ${path.basename(outPath)}`);
				if (choice.value !== 'inPlace') {
					void vscode.window.showTextDocument(vscode.Uri.file(outPath));
				}
				// Validate migrated output (in place or new file).
				await validateProject(extensionContext, diagnostics, outPath);
			}
		}
	);
}

async function pickGenerateOptions(defaultProjectName: string): Promise<GenerateOptions | undefined> {
	const preset = await vscode.window.showQuickPick(
		[
			{
				label: 'Resource XML only',
				detail: 'Writes <project>.resource.xml',
				value: 'resourceXmlOnly',
			},
			{
				label: 'Resource + Specification (stubs)',
				detail: 'Also writes placeholder resource/spec files',
				value: 'resourceAndSpec',
			},
			{
				label: 'Resource + Specification + Binary (stubs)',
				detail: 'Also writes placeholder .bin (uses resource XML as input)',
				value: 'resourceSpecAndBin',
			},
		],
		{ title: 'GUIX: Generate Outputs (Phase 1)' }
	);
	if (!preset) return undefined;

	const generateResource = preset.value !== 'resourceXmlOnly';
	const generateSpecification = preset.value !== 'resourceXmlOnly';
	const generateBinary = preset.value === 'resourceSpecAndBin';

	const resourceFilename = generateResource
		? await vscode.window.showInputBox({
			prompt: 'Resource output filename (Phase 1 stub)',
			value: `${defaultProjectName}_resources.c`,
		})
		: undefined;
	if (generateResource && !resourceFilename) return undefined;

	const specFilename = generateSpecification
		? await vscode.window.showInputBox({
			prompt: 'Specification output filename (Phase 1 stub)',
			value: `${defaultProjectName}_specification.txt`,
		})
		: undefined;
	if (generateSpecification && !specFilename) return undefined;

	let bigEndian = false;
	let noResHeader = false;
	if (generateBinary) {
		const endian = await vscode.window.showQuickPick(
			[
				{ label: 'Little endian', value: 'little' },
				{ label: 'Big endian', value: 'big' },
			],
			{ title: 'Binary output endianness (Phase 1 stub)' }
		);
		if (!endian) return undefined;
		bigEndian = endian.value === 'big';

		const header = await vscode.window.showQuickPick(
			[
				{ label: 'Include resource header', value: 'withHeader' },
				{ label: 'No resource header', value: 'noHeader' },
			],
			{ title: 'Binary output header (Phase 1 stub)' }
		);
		if (!header) return undefined;
		noResHeader = header.value === 'noHeader';
	}

	return {
		generateResource,
		resourceFilename: resourceFilename || undefined,
		generateSpecification,
		specFilename: specFilename || undefined,
		generateBinary,
		bigEndian,
		noResHeader,
	};
}

async function pickBinaryOnlyOptions(): Promise<Pick<GenerateOptions, 'generateBinary' | 'bigEndian' | 'noResHeader'>> {
	const endian = await vscode.window.showQuickPick(
		[
			{ label: 'Little endian', value: 'little' },
			{ label: 'Big endian', value: 'big' },
		],
		{ title: 'Binary output endianness (Phase 1 stub)' }
	);
	if (!endian) {
		throw new Error('Cancelled');
	}
	const bigEndian = endian.value === 'big';

	const header = await vscode.window.showQuickPick(
		[
			{ label: 'Include resource header', value: 'withHeader' },
			{ label: 'No resource header', value: 'noHeader' },
		],
		{ title: 'Binary output header (Phase 1 stub)' }
	);
	if (!header) {
		throw new Error('Cancelled');
	}
	const noResHeader = header.value === 'noHeader';

	return { generateBinary: true, bigEndian, noResHeader };
}

async function showProjectSummary(extensionContext: vscode.ExtensionContext, gxpPath: string): Promise<void> {
	const output = getOutputChannel();
	output.show(true);

	const resolvedCli = await resolveCliPathSafe(extensionContext, true);
	if (!resolvedCli) return;
	const cli = resolvedCli.path;
	output.appendLine(`Using CLI: ${cli} (${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''})`);
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

	const resolvedCli = await resolveCliPathSafe(extensionContext, true);
	if (!resolvedCli) return;
	const cli = resolvedCli.path;
	output.appendLine(`Using CLI: ${cli} (${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''})`);
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

function coercePathArg(arg: unknown): string | undefined {
	if (!arg) return undefined;
	if (typeof arg === 'string') return arg;
	if (typeof arg === 'object' && 'gxpPath' in (arg as any) && typeof (arg as any).gxpPath === 'string') {
		return (arg as any).gxpPath;
	}
	if (typeof arg === 'object' && 'resourceUri' in (arg as any)) {
		const ru = (arg as any).resourceUri;
		if (ru && typeof ru.fsPath === 'string') return ru.fsPath;
	}
	return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
	const diagnostics = getDiagnosticsCollection();
	context.subscriptions.push(diagnostics);
	const genDiagnostics = getGenerateDiagnosticsCollection();
	context.subscriptions.push(genDiagnostics);

	const cliStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	cliStatus.command = 'guix.showCliInfo';
	cliStatus.text = 'GUIX CLI: …';
	cliStatus.tooltip = 'GUIX Studio CLI resolution';
	cliStatus.show();
	context.subscriptions.push(cliStatus);

	const refreshCliStatus = async () => {
		const resolvedCli = await resolveCliPathSafe(context, false, false);
		if (!resolvedCli) {
			cliStatus.text = 'GUIX CLI: missing';
			cliStatus.color = new vscode.ThemeColor('statusBarItem.warningForeground');
			cliStatus.tooltip = 'GUIX Studio CLI not found. Click for help.';
			return;
		}
		const detail = `${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''}`;
		cliStatus.text = `GUIX CLI: ${resolvedCli.source}`;
		cliStatus.color = undefined;
		cliStatus.tooltip = `CLI: ${resolvedCli.path}\nSource: ${detail}\n\nClick to show details.`;
	};

	const projectsProvider = new GuixProjectsProvider();
	vscode.window.registerTreeDataProvider('guixProjects', projectsProvider);
	context.subscriptions.push(GxpDesignerEditorProvider.register(context));

	// Best-effort refresh; avoid popping UI.
	void refreshCliStatus();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('guixStudio.cli.path') || e.affectsConfiguration('guixStudio.outputPath')) {
				void refreshCliStatus();
			}
		})
	);
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void refreshCliStatus();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.selectCliPath', async () => {
			const picked = await vscode.window.showOpenDialog({
				canSelectMany: false,
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: 'Select guix_studio_cli',
			});
			if (!picked?.[0]) return;

			const chosen = picked[0].fsPath;
			await vscode.workspace.getConfiguration('guixStudio').update('cli.path', chosen, vscode.ConfigurationTarget.Global);
			void vscode.window.showInformationMessage(`GUIX CLI path set: ${path.basename(chosen)}`);
			void refreshCliStatus();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.showCliInfo', async () => {
			const output = getOutputChannel();
			output.show(true);

			const resolvedCli = await resolveCliPathSafe(context, true);
			if (!resolvedCli) return;

			const detail = `${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''}`;
			output.appendLine('---');
			output.appendLine(`CLI: ${resolvedCli.path}`);
			output.appendLine(`Source: ${detail}`);

			const choice = await vscode.window.showInformationMessage(
				`GUIX CLI: ${resolvedCli.path} (${detail})`,
				'Copy Path',
				'Select CLI Path',
				'Build CLI',
				'Open Settings'
			);
			if (choice === 'Copy Path') {
				await vscode.env.clipboard.writeText(resolvedCli.path);
			} else if (choice === 'Select CLI Path') {
				await vscode.commands.executeCommand('guix.selectCliPath');
			} else if (choice === 'Build CLI') {
				await vscode.commands.executeCommand('guix.buildCli');
			} else if (choice === 'Open Settings') {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'guixStudio.cli.path');
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.addVsCodeTasks', async () => {
			await addVsCodeTasks();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.buildCli', async () => {
			await buildCliInWorkspace(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.openProject', async (arg?: unknown) => {
			const file = coercePathArg(arg) ?? (await pickGxpFile());
			if (!file) return;
			await showProjectSummary(context, file);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.openDesigner', async (arg?: unknown) => {
			const fromArg = coercePathArg(arg);
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp =
				fromArg ?? (active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile());
			if (!gxp) return;
			await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(gxp), GxpDesignerEditorProvider.viewType);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.migrateProject', async (arg?: unknown) => {
			const fromArg = coercePathArg(arg);
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp = fromArg ?? (active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile());
			if (!gxp) return;
			await migrateProject(context, diagnostics, gxp);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.projectSummary', async (arg?: unknown) => {
			const fromArg = coercePathArg(arg);
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp =
				fromArg ?? (active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile());
			if (!gxp) return;
			await showProjectSummary(context, gxp);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.validateProject', async (arg?: unknown) => {
			const fromArg = coercePathArg(arg);
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp =
				fromArg ?? (active?.toLowerCase().endsWith('.gxp') ? active : await pickGxpFile());
			if (!gxp) return;
			await validateProject(context, diagnostics, gxp);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.refreshProjects', () => {
			projectsProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(async (doc) => {
			if (!doc.fileName.toLowerCase().endsWith('.gxp')) return;

			const generateOnSave = vscode.workspace.getConfiguration('guixStudio').get<boolean>('generateOnSave', false);
			if (generateOnSave) {
				// Non-interactive: relies on CLI + outputPath being configured.
				await quickGenerateGxp(context, doc.fileName, false);
			}

			const validateOnSave = vscode.workspace.getConfiguration('guixStudio').get<boolean>('validateOnSave', true);
			if (!validateOnSave) return;
			const resolvedCli = await resolveCliPathSafe(context, false);
			if (!resolvedCli) return;
			const cli = resolvedCli.path;
			// Call validate directly with the resolved CLI to avoid double resolution.
			const output = getOutputChannel();
			output.show(true);
			output.appendLine(`Using CLI: ${cli} (${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''})`);
			output.appendLine(`Validate: ${doc.fileName}`);

			let result: CliValidateResult;
			try {
				result = await execFileJson<CliValidateResult>(cli, ['validate', '--project', doc.fileName, '--json']);
			} catch {
				// Avoid noisy popups on save; errors can be investigated via explicit Validate.
				return;
			}

			const uri = vscode.Uri.file(doc.fileName);
			const document = doc;
			const diags: vscode.Diagnostic[] = [];
			for (const e of result.errors ?? []) {
				const range = guessRelatedRange(document, '<project_name>');
				const d = new vscode.Diagnostic(range, e, vscode.DiagnosticSeverity.Error);
				d.source = 'guix_studio_cli';
				diags.push(d);
			}
			for (const w of result.warnings ?? []) {
				const range = guessRelatedRange(document, '<project_version>');
				const d = new vscode.Diagnostic(range, w, vscode.DiagnosticSeverity.Warning);
				d.source = 'guix_studio_cli';
				diags.push(d);
			}
			diagnostics.set(uri, diags);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.generateOutputs', async (arg?: unknown) => {
			const output = getOutputChannel();
			output.show(true);

			const fromArg = coercePathArg(arg);
			const input = fromArg ? { kind: 'gxp' as const, path: fromArg } : await pickGenerateInputPath();
			if (!input) return;

			const outDir = await resolveOutputFolderInteractive();
			if (!outDir) return;
			await ensureDirectoryExists(outDir);

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'GUIX: Generate Outputs',
					cancellable: false,
				},
				async () => {
					const resolvedCli = await resolveCliPathSafe(context, true);
					if (!resolvedCli) return;
					const cli = resolvedCli.path;

					let defaultName = path.basename(input.path, path.extname(input.path));
					if (input.kind === 'gxp') {
						const summary = await execFileJson<CliSummary>(cli, ['summary', '--project', input.path, '--json']);
						defaultName = summary.project_name ?? defaultName;
					}

					let options: GenerateOptions;
					if (input.kind === 'gxp') {
						const picked = await pickGenerateOptions(defaultName);
						if (!picked) return;
						options = picked;
					} else {
						// For resource XML input, Phase 1 supports only binary output workflow.
						let binOpts;
						try {
							binOpts = await pickBinaryOnlyOptions();
						} catch {
							return;
						}
						options = {
							generateResource: false,
							generateSpecification: false,
							generateBinary: true,
							bigEndian: binOpts.bigEndian,
							noResHeader: binOpts.noResHeader,
						};
					}

					output.appendLine(`Using CLI: ${cli} (${resolvedCli.source}${resolvedCli.detail ? `, ${resolvedCli.detail}` : ''})`);
					output.appendLine(`Input: ${input.path}`);
					output.appendLine(`Output folder: ${outDir}`);
					output.appendLine(
						`Options: resource=${options.generateResource}, spec=${options.generateSpecification}, binary=${options.generateBinary}`
					);

					let result: CliGenerateResult;
					try {
						const args: string[] = ['generate'];
						if (input.kind === 'gxp') {
							args.push('-p', input.path);
						} else {
							args.push('-x', input.path);
						}
						args.push('--output_path', outDir, '--json');
						if (options.generateResource && options.resourceFilename) {
							args.push('-r', options.resourceFilename);
						}
						if (options.generateSpecification && options.specFilename) {
							args.push('-s', options.specFilename);
						}
						if (options.generateBinary) {
							args.push('-b');
							if (options.bigEndian) args.push('--big_endian');
							if (options.noResHeader) args.push('--no_res_header');
						}

						result = await execFileJson<CliGenerateResult>(cli, [
							...args,
						]);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						output.appendLine('---');
						output.appendLine(message);
						void vscode.window.showErrorMessage('GUIX generation failed. See Output: GUIX Studio.');
						return;
					}

					output.appendLine('---');
					const outputs = result.outputs ?? [];
					if (outputs.length > 0) {
						for (const o of outputs) {
							output.appendLine(`${o.kind}: ${o.path}`);
						}
						void vscode.window.showInformationMessage(`GUIX generation completed (${outputs.length} outputs).`);
						return;
					}
					if (result.resource_xml) {
						output.appendLine(`resource_xml: ${result.resource_xml}`);
						void vscode.window.showInformationMessage(`Generated: ${path.basename(result.resource_xml)}`);
						return;
					}
					output.appendLine('Generation completed, but no outputs were reported.');
					void vscode.window.showInformationMessage('GUIX generation completed.');
				}
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.quickGenerateOutputs', async (arg?: unknown) => {
			const fromArg = coercePathArg(arg);
			const active = vscode.window.activeTextEditor?.document?.fileName;
			const gxp = fromArg ?? (active?.toLowerCase().endsWith('.gxp') ? active : undefined);
			if (!gxp) {
				void vscode.window.showWarningMessage('No active .gxp file. Open a project file to quick-generate.');
				return;
			}
			await quickGenerateGxp(context, gxp, true);
		})
	);
}

export function deactivate(): void {
	// no-op
}
