/**
 * XLIFF 1.2 read/write helpers.
 *
 * Ports guix_studio/xliff_read_write.cpp.
 *
 * The GUIX Studio XLIFF dialect:
 *   - Root element:  <xliff version="1.2">
 *   - One <file> per source→target language pair.
 *   - Each string becomes a <trans-unit id="STRING_ID_NAME">.
 *   - Source text lives in <source>, translated text in <target>.
 *
 * These are pure functions — they do not depend on any injected services.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One translatable unit: id-name → translated text. */
export interface XliffUnit {
    id: string;
    source: string;
    target: string;
}

// ---------------------------------------------------------------------------
// readXliff
// ---------------------------------------------------------------------------

/**
 * Parse an XLIFF 1.2 document and return all trans-unit records.
 *
 * @param xml   Full XLIFF document text.
 * @returns     Array of units in document order.
 */
export function readXliff(xml: string): XliffUnit[] {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const units: XliffUnit[] = [];

    const tuList = doc.getElementsByTagName('trans-unit');
    for (let i = 0; i < tuList.length; i++) {
        const tu = tuList.item(i);
        if (!tu) continue;

        const id       = tu.getAttribute('id') ?? '';
        const srcEl    = tu.getElementsByTagName('source').item(0);
        const tgtEl    = tu.getElementsByTagName('target').item(0);
        const source   = srcEl?.textContent ?? '';
        const target   = tgtEl?.textContent ?? '';

        units.push({ id, source, target });
    }

    return units;
}

// ---------------------------------------------------------------------------
// writeXliff
// ---------------------------------------------------------------------------

/**
 * Serialize an array of XliffUnits to an XLIFF 1.2 document string.
 *
 * @param units          Translation units to serialize.
 * @param sourceLang     BCP-47 language tag for the source language (e.g. "en").
 * @param targetLang     BCP-47 language tag for the target language (e.g. "fr").
 * @param originalFile   Value for the <file original=""> attribute.
 */
export function writeXliff(
    units: ReadonlyArray<XliffUnit>,
    sourceLang: string,
    targetLang: string,
    originalFile = 'strings',
): string {
    const doc = new DOMParser().parseFromString(
        '<?xml version="1.0" encoding="UTF-8"?><xliff version="1.2"/>',
        'text/xml',
    );

    const root = doc.documentElement;
    root.setAttribute('version', '1.2');
    root.setAttribute('xmlns', 'urn:oasis:names:tc:xliff:document:1.2');

    const file = doc.createElement('file');
    file.setAttribute('original',        originalFile);
    file.setAttribute('source-language', sourceLang);
    file.setAttribute('target-language', targetLang);
    file.setAttribute('datatype',        'plaintext');
    root.appendChild(file);

    const body = doc.createElement('body');
    file.appendChild(body);

    for (const unit of units) {
        const tu = doc.createElement('trans-unit');
        tu.setAttribute('id', unit.id);

        const srcEl = doc.createElement('source');
        srcEl.textContent = unit.source;
        tu.appendChild(srcEl);

        const tgtEl = doc.createElement('target');
        tgtEl.textContent = unit.target;
        tu.appendChild(tgtEl);

        body.appendChild(tu);
    }

    return new XMLSerializer().serializeToString(doc);
}
