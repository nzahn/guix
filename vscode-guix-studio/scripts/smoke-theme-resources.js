/*
 * Minimal smoke test for GXP parsing.
 *
 * Intended for quick local verification (CI wiring can come later).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

function fail(message) {
	console.error(`[smoke:gxp] FAIL: ${message}`);
	process.exitCode = 1;
}

function assert(cond, message) {
	if (!cond) fail(message);
}

function main() {
	// Ensure we load the compiled output (this is run via `npm run compile` first).
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { parseGxp, applyGxpEdit } = require(path.join(__dirname, '..', 'out', 'gxpModel'));

	function findCliCandidatePaths() {
		const exe = process.platform === 'win32' ? 'guix_studio_cli.exe' : 'guix_studio_cli';
		const repoRoot = path.resolve(__dirname, '..', '..');
		return [
			process.env.GUIX_STUDIO_CLI,
			path.join(repoRoot, 'build', 'guix_studio_cli_ninja', exe),
			path.join(repoRoot, 'build', 'guix_studio_cli', exe),
			path.join(repoRoot, 'tools', 'guix_studio_cli', 'build', exe),
		].filter(Boolean);
	}

	function findCli() {
		const candidates = [];
		for (const p of findCliCandidatePaths()) {
			try {
				if (fs.existsSync(p) && fs.statSync(p).isFile()) candidates.push(p);
			} catch {
				// ignore
			}
		}
		if (candidates.length === 0) return null;

		// Prefer a CLI that responds to `help` (guards against wrong binary/permission issues)
		// and, when possible, advertises translation subcommands.
		let firstRunnable = null;
		for (const p of candidates) {
			const h = runCli(p, ['help'], undefined);
			if (!h.ok) continue;
			if (!firstRunnable) firstRunnable = p;
			const txt = String(h.out || '');
			if (txt.includes('export-strings') && txt.includes('export-xliff')) {
				return p;
			}
		}
		return firstRunnable || candidates[0];
	}

	function runCli(cliPath, args, cwd) {
		try {
			const out = cp.execFileSync(cliPath, args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			return { ok: true, out: String(out) };
		} catch (err) {
			const stderr = err && err.stderr ? String(err.stderr) : '';
			const stdout = err && err.stdout ? String(err.stdout) : '';
			return {
				ok: false,
				err: `${err instanceof Error ? err.message : String(err)}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
			};
		}
	}

	function maybeRunCliSmoke() {
		const cli = findCli();
		if (!cli) {
			console.log('[smoke:gxp] NOTE: guix_studio_cli not found; skipping CLI smoke (set GUIX_STUDIO_CLI to force)');
			return;
		}

		const repoRoot = path.resolve(__dirname, '..', '..');
		const gxpPath = path.resolve(repoRoot, 'samples', 'demo_guix_simple', 'guix_simple.gxp');
		if (!fs.existsSync(gxpPath)) {
			console.log(`[smoke:gxp] NOTE: missing CLI smoke fixture: ${gxpPath}`);
			return;
		}

		const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guix-vscode-smoke-cli-'));
		try {
			// Basic execution check.
			const summary = runCli(cli, ['summary', '--project', gxpPath, '--json'], repoRoot);
			assert(summary.ok, `CLI summary failed: ${summary.err}`);
			// Accept either newer JSON contract (ok:true) or older one (project_name present).
			assert(/"ok"\s*:\s*true/.test(summary.out) || /"project_name"\s*:\s*"/.test(summary.out), 'CLI summary JSON missing expected fields');

			const help = runCli(cli, ['help'], repoRoot);
			const helpText = help.ok ? String(help.out || '') : '';
			const supportsTranslations = helpText.includes('export-strings') && helpText.includes('export-xliff');
			if (!supportsTranslations) {
				console.log('[smoke:gxp] NOTE: CLI does not advertise translation subcommands; skipping CSV/XLIFF smoke');
				return;
			}

			// Translation workflow quick checks.
			const csvPath = path.join(outDir, 'strings.csv');
			const xlfPath = path.join(outDir, 'strings.xlf');
			const expCsv = runCli(cli, ['export-strings', '--project', gxpPath, '--output', csvPath, '--src', 'English', '--target', 'French', '--json'], repoRoot);
			assert(expCsv.ok, `CLI export-strings failed: ${expCsv.err}`);
			assert(fs.existsSync(csvPath), 'CLI export-strings did not create output CSV');

			const expXlf = runCli(cli, ['export-xliff', '--project', gxpPath, '--output', xlfPath, '--src', 'English', '--target', 'French', '--version', '2', '--json'], repoRoot);
			assert(expXlf.ok, `CLI export-xliff failed: ${expXlf.err}`);
			assert(fs.existsSync(xlfPath), 'CLI export-xliff did not create output XLIFF');

			if (!process.exitCode) {
				console.log(`[smoke:gxp] OK: CLI smoke passed (cli=${path.basename(cli)})`);
			}
		} finally {
			try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
		}
	}

	function roundTripStringEdit(gxpPath, xmlText, project) {
		// Exercise `setStringTableValue` end-to-end (apply edit -> reparse -> assert).
		const d0 = project.displays[0];
		const displayIndex = d0 && typeof d0.index === 'number' ? d0.index : 0;
		const langs = Array.isArray(project.languages) && project.languages.length > 0 ? project.languages : ['English'];
		// Prefer a non-zero language index when possible to ensure padding logic runs.
		const langIndex = langs.length > 1 ? (langs.length - 1) : 0;
		const stringIds = Array.isArray(project.stringIds) ? project.stringIds : [];
		const stringId = (stringIds[0] && String(stringIds[0]).trim()) ? String(stringIds[0]).trim() : '__SMOKE_STRING_ID__';
		const value = '__smoke_value__';

		let updated;
		try {
			updated = applyGxpEdit(xmlText, {
				kind: 'setStringTableValue',
				displayIndex,
				stringId,
				languageIndex: langIndex,
				value,
			});
		} catch (err) {
			fail(`applyGxpEdit(setStringTableValue) threw for ${path.basename(gxpPath)}: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}

		const project2 = parseGxp(updated);
		assert(project2 && typeof project2 === 'object', 'parseGxp returned nothing after edit');
		assert(project2.stringTable && typeof project2.stringTable === 'object', 'stringTable missing after edit');
		assert(project2.stringTable[stringId], `stringTable missing edited id after edit: ${stringId}`);
		assert(Array.isArray(project2.stringTable[stringId]), 'Edited stringTable record should be an array');
		assert(project2.stringTable[stringId].length >= Math.max(1, langs.length, langIndex + 1), 'Edited record not padded to expected length');
		assert(project2.stringTable[stringId][langIndex] === value, 'Edited stringTable value did not round-trip');
	}

	function checkOne(gxpPath) {
		assert(fs.existsSync(gxpPath), `Missing fixture: ${gxpPath}`);

		const xmlText = fs.readFileSync(gxpPath, 'utf8');
		const project = parseGxp(xmlText);
		assert(project && typeof project === 'object', 'parseGxp returned nothing');
		assert(Array.isArray(project.displays) && project.displays.length > 0, 'No displays parsed');

		const d0 = project.displays[0];
		assert(Array.isArray(d0.themes), 'Display themes not parsed');
		assert(Array.isArray(d0.themeResources), 'Display themeResources not parsed');
		assert(d0.themeResources.length >= 1, 'No themeResources entries');
		assert(d0.themes.length === d0.themeResources.length, 'themes length does not match themeResources length');

		const active = Math.max(0, Math.min(d0.activeTheme || 0, d0.themeResources.length - 1));
		assert(Array.isArray(d0.themeResources[active].colorNames), 'Active theme colorNames missing');
		assert(Array.isArray(d0.themeResources[active].fontNames), 'Active theme fontNames missing');
		assert(Array.isArray(d0.themeResources[active].pixelmapNames), 'Active theme pixelmapNames missing');

		// The convenience lists should reflect the active theme lists.
		assert(
			JSON.stringify(d0.colorNames) === JSON.stringify(d0.themeResources[active].colorNames),
			'colorNames does not match active themeResources colorNames'
		);
		assert(
			JSON.stringify(d0.fontNames) === JSON.stringify(d0.themeResources[active].fontNames),
			'fontNames does not match active themeResources fontNames'
		);
		assert(
			JSON.stringify(d0.pixelmapNames) === JSON.stringify(d0.themeResources[active].pixelmapNames),
			'pixelmapNames does not match active themeResources pixelmapNames'
		);

		roundTripStringEdit(gxpPath, xmlText, project);

		if (project.stringTable && typeof project.stringTable === 'object') {
			const ids = Object.keys(project.stringTable);
			// If a project has a string table, it should have some ids.
			if (ids.length > 0) {
				const first = project.stringTable[ids[0]];
				assert(Array.isArray(first), 'stringTable values should be arrays');
			}
			const langs = Array.isArray(project.languages) && project.languages.length > 0 ? project.languages : ['English'];
			let minVals = Infinity;
			let sawEmptyRecord = false;
			let anyMissingTranslation = false;
			for (const id of ids) {
				const vals = project.stringTable[id];
				if (!Array.isArray(vals)) continue;
				if (vals.length === 0) {
					sawEmptyRecord = true;
					continue;
				}
				minVals = Math.min(minVals, vals.length);
				if (langs.length > 1 && vals.length > 0 && vals.length < langs.length) {
					anyMissingTranslation = true;
				}
			}
			if (langs.length > 1) {
				if (anyMissingTranslation) {
					console.log(`[smoke:gxp] OK: ${path.basename(gxpPath)} has strings missing some translations (languages=${langs.length}, minVals=${Number.isFinite(minVals) ? minVals : 'n/a'}${sawEmptyRecord ? ', hasEmptyRecords=1' : ''})`);
				} else {
					console.log(`[smoke:gxp] NOTE: ${path.basename(gxpPath)} has no missing-translation cases (languages=${langs.length}, minVals=${Number.isFinite(minVals) ? minVals : 'n/a'}${sawEmptyRecord ? ', hasEmptyRecords=1' : ''})`);
				}
			}
		}

		if (!process.exitCode) {
			console.log(`[smoke:gxp] OK: parsed ${path.basename(gxpPath)} (themes=${d0.themes.length}, themeResources=${d0.themeResources.length})`);
		}
	}

	const defaultBinres2Theme = path.resolve(
		__dirname,
		'..',
		'..',
		'tutorials',
		'demo_guix_binres',
		'demo_guix_binres.gxp'
	);
	const defaultMulti5Theme = path.resolve(
		__dirname,
		'..',
		'..',
		'test',
		'example_internal',
		'multi_themes_16bpp',
		'multi_themes_16bpp.gxp'
	);
	const defaultMultiLang = path.resolve(
		__dirname,
		'..',
		'..',
		'test',
		'example_internal',
		'glyph_draw_multi_lang_32bpp',
		'glyph_draw_multi_lang_32bpp.gxp'
	);

	if (process.argv[2]) {
		checkOne(path.resolve(process.argv[2]));
		maybeRunCliSmoke();
		return;
	}

	checkOne(defaultBinres2Theme);
	if (fs.existsSync(defaultMulti5Theme)) {
		checkOne(defaultMulti5Theme);
	}
	if (fs.existsSync(defaultMultiLang)) {
		checkOne(defaultMultiLang);
	}

	maybeRunCliSmoke();
}

main();
