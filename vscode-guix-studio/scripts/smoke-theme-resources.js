/*
 * Minimal smoke test for GXP parsing.
 *
 * Intended for quick local verification (CI wiring can come later).
 */

const fs = require('fs');
const path = require('path');

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
		return;
	}

	checkOne(defaultBinres2Theme);
	if (fs.existsSync(defaultMulti5Theme)) {
		checkOne(defaultMulti5Theme);
	}
	if (fs.existsSync(defaultMultiLang)) {
		checkOne(defaultMultiLang);
	}
}

main();
