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

function getOutputChannel(): vscode.OutputChannel {
	return vscode.window.createOutputChannel('GUIX Studio');
}

function getDiagnosticsCollection(): vscode.DiagnosticCollection {
	return vscode.languages.createDiagnosticCollection('guix-gxp');
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

	const cli = await resolveCliPath(extensionContext);

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
			output.appendLine(`Using CLI: ${cli}`);
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

	const projectsProvider = new GuixProjectsProvider();
	vscode.window.registerTreeDataProvider('guixProjects', projectsProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.openProject', async (arg?: unknown) => {
			const file = coercePathArg(arg) ?? (await pickGxpFile());
			if (!file) return;
			await showProjectSummary(context, file);
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
			await validateProject(context, diagnostics, doc.fileName);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('guix.generateOutputs', async (arg?: unknown) => {
			const output = getOutputChannel();
			output.show(true);

			const fromArg = coercePathArg(arg);
			const input = fromArg ? { kind: 'gxp' as const, path: fromArg } : await pickGenerateInputPath();
			if (!input) return;

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

					output.appendLine(`Using CLI: ${cli}`);
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
}

export function deactivate(): void {
	// no-op
}
