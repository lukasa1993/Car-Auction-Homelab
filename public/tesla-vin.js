/* Tesla VIN tables: see docs/tesla-vin-decoder.md for primary sources.
 * Keep this a classic script so vin.html also works from a local file, offline.
 * A VIN identifies the encoded configuration, not every option or marketed trim.
 */
const WMI_INFO = {
    '5YJ': 'Tesla, Inc. · United States',
    '7SA': 'Tesla, Inc. · United States · Model X / Model Y',
    '7G2': 'Tesla, Inc. · United States · Trucks',
    LRW: 'Tesla (Shanghai) · China',
    XP7: 'Tesla Manufacturing Brandenburg · Germany'
};
const MODELS = { S: 'Model S', '3': 'Model 3', X: 'Model X', Y: 'Model Y', C: 'Cybertruck', T: 'Semi', A: 'Cybercab' };
const WMI_MODELS = { '5YJ': ['S', '3', 'X', 'Y', 'A'], '7SA': ['X', 'Y'], '7G2': ['C', 'T'], LRW: ['3', 'Y'], XP7: ['Y'] };
const PLANTS = { F: 'Fremont, California, USA', A: 'Austin, Texas, USA', C: 'Shanghai, China', B: 'Berlin, Germany', N: 'Reno, Nevada, USA' };
// The 2010–2039 cycle. Later year codes remain readable without promising
// that the current drivetrain tables cover unpublished configurations.
const YEARS = Object.fromEntries(Array.from('ABCDEFGHJKLMNPRSTVWXY123456789', (code, i) => [code, 2010 + i]));
const CAR_RESTRAINTS = {
    '1': 'Manual belts · front, side and knee airbags · passenger detection',
    '7': 'Manual belts · front and side airbags'
};
const MPV_RESTRAINTS = {
    A: 'Manual belts · 3 second-row + 2 third-row seats · front, side and knee airbags · passenger detection',
    B: 'Manual belts · 2 second-row + 2 third-row seats · front, side and knee airbags · passenger detection',
    C: 'Manual belts · front and side airbags · passenger detection',
    D: 'Manual belts · 3 second-row seats · front, side and knee airbags · passenger detection'
};
const SX_MOTORS = { '2': 'Dual motor · standard', '4': 'Dual motor · performance', '5': 'Dual motor · P2', '6': 'Tri motor · P2 / Plaid' };
const BATTERIES = { E: 'Electric · lithium-ion battery', F: 'Electric · lithium iron phosphate (LFP) battery' };
const MODEL_DATA = {
    S: {
        body: { A: '5-door hatchback · left-hand drive', B: '5-door hatchback · right-hand drive' },
        restraint: {
            ...CAR_RESTRAINTS,
            '2': 'Manual belts · EU specification · front, side and knee airbags',
            '3': 'Manual belts · front and side airbags',
            '4': 'Manual belts · 2 second-row seats · front, side and knee airbags',
            '5': 'Manual belts · 2 second-row seats · front and side airbags',
            '6': 'Manual belts · 3 second-row seats · front and side airbags',
            '8': 'Manual belts · 2 second-row seats · front and side airbags · active hood'
        },
        fuel: { E: 'Electric', H: 'Lithium-ion battery · high capacity', S: 'Lithium-ion battery · standard capacity', V: 'Lithium-ion battery · ultra-high capacity', A: '10 kW AC charger', B: '20 kW AC charger', C: '10 kW AC charger · DC fast charging', D: '20 kW AC charger · DC fast charging' },
        motor: { ...SX_MOTORS, '1': 'Single motor · standard', '3': 'Single motor · performance', C: 'AC induction motor · 31–40 kWh battery tier', G: 'AC induction motor · 51–60 kWh battery tier', N: 'AC induction motor · 81–90 kWh battery tier', P: 'Performance AC induction motor · 81–90 kWh battery tier' }
    },
    X: {
        body: { C: '5-door MPV · left-hand drive', D: '5-door MPV · right-hand drive' },
        restraint: MPV_RESTRAINTS,
        fuel: { E: 'Electric' },
        motor: SX_MOTORS
    },
    '3': {
        body: { E: '4-door sedan · left-hand drive', F: '4-door sedan · right-hand drive' },
        restraint: CAR_RESTRAINTS,
        fuel: BATTERIES,
        // Combine documented old/new codes: refreshes overlap model years.
        motor: { A: 'Single motor', B: 'Dual motor · standard', C: 'Dual motor · performance', J: 'Single motor · standard', K: 'Dual motor · standard', R: 'Single motor · standard', S: 'Single motor · standard', T: 'Dual motor · performance' }
    },
    Y: {
        body: { G: '5-door MPV · left-hand drive', H: '5-door MPV · right-hand drive' },
        restraint: MPV_RESTRAINTS,
        fuel: BATTERIES,
        motor: { D: 'Single motor', E: 'Dual motor · standard', F: 'Dual motor · performance', J: 'Single motor · standard', K: 'Dual motor · standard', L: 'Dual motor · performance', R: 'Single motor · standard', S: 'Single motor · standard' }
    },
    C: {
        body: { E: 'Pickup · left-hand drive · manual belts, front, side and knee airbags · passenger detection' },
        // Truck position 6 encodes GVWR, not passenger-car restraints.
        restraint: { G: 'GVWR: 8,001–9,000 lb (class G)', H: 'GVWR: 9,001–10,000 lb (class H)' },
        fuel: { E: 'Electric' },
        motor: { C: 'Single motor · standard', D: 'Dual motor · standard / AWD', E: 'Tri motor · performance / Cyberbeast' }
    },
    T: {
        body: { A: 'Day cab · short', B: 'Day cab' },
        restraint: { E: 'GVWR: 33,001 lb and above (class 8)' },
        fuel: { E: 'Electric' },
        motor: { B: 'Dual-drive rear axle · air brakes' }
    },
    A: {
        // NHTSA's published 5YJAJEEU*TA descriptor. It does not specify
        // the motor count or trim for U; do not infer either from the model.
        body: { J: '2-door hatchback · left-hand drive' },
        restraint: { E: 'Manual belts · passenger detection' },
        fuel: { E: 'Electric' },
        motor: {}
    }
};

function normalizeVIN(value) {
    return String(value || '').toUpperCase().replace(/\s+/g, '').replace(/\?/g, '*');
}

function expectedCheckDigit(vin) {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
    const values = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    const remainder = Array.from(vin).reduce((sum, code, i) => sum + (values[code] ?? Number(code)) * weights[i], 0) % 11;
    return remainder === 10 ? 'X' : String(remainder);
}

function decodeVIN(value) {
    const v = normalizeVIN(value);
    if (v.length < 3) return { error: 'Enter at least 3 characters.' };
    if (v.length > 17) return { error: 'A VIN cannot be longer than 17 characters.' };
    if (!/^[A-HJ-NPR-Z0-9*]+$/.test(v)) return { error: 'Use VIN letters and digits (no I, O or Q). Use * or ? for unknown positions.' };
    const wmi = v.slice(0, 3);
    if (wmi === 'SFZ' || (wmi === '5YJ' && v[3] === 'R')) return { error: 'The original Tesla Roadster is excluded from this decoder.' };
    if (!WMI_INFO[wmi]) return { error: 'Unknown Tesla manufacturer code. Expected 5YJ, 7SA, 7G2, LRW or XP7.' };

    const codeAt = (index) => v[index] && v[index] !== '*' ? v[index] : null;
    const modelCode = codeAt(3);
    // Only Berlin has a unique model. 7SA can mean either Model X or Y.
    const model = modelCode ? (WMI_MODELS[wmi].includes(modelCode) ? modelCode : null) : (wmi === 'XP7' ? 'Y' : null);
    const yearCode = codeAt(9);
    const year = YEARS[yearCode] ?? null;
    const plantCode = codeAt(10);
    const data = MODEL_DATA[model];
    const issues = [];
    const lookup = (table, code, label) => {
        if (code === null) return null;
        if (!table) return 'Needs a recognized model';
        if (Object.hasOwn(table, code)) return table[code];
        issues.push(`${label}: unknown code ${code}.`);
        return `Unknown code ${code} · not in the documented tables`;
    };
    if (modelCode && !model) issues.push(`Unknown model code ${modelCode} for ${wmi}.`);
    if (yearCode && !year) issues.push(`Unknown year code ${yearCode}.`);
    if (year && year > 2027) issues.push('Year decoded; configuration tables for this year are not yet verified.');

    const bodyCode = codeAt(4);
    let bodyTable = data?.body;
    if (model === 'S') {
        const earlyBody = { A: '5-door hatchback · left-hand drive · rear-wheel drive', B: '5-door hatchback · left-hand drive · all-wheel drive', C: '5-door hatchback · right-hand drive · rear-wheel drive', D: '5-door hatchback · right-hand drive · all-wheel drive' };
        if (year && year <= 2013) bodyTable = earlyBody;
        else if (!year) bodyTable = { ...data.body, C: earlyBody.C, D: earlyBody.D, B: '5-door hatchback · LHD / AWD (2012–2013) or RHD (2014+); year needed' };
    }
    const restraintCode = codeAt(5);
    let restraintTable = data?.restraint;
    if (model === 'S' && (!year || year <= 2017)) {
        restraintTable = { ...restraintTable, '7': year ? `${CAR_RESTRAINTS['7']} · active hood` : `${CAR_RESTRAINTS['7']} · active hood on earlier configurations` };
    }
    const fuelCode = codeAt(6);
    const motorCode = codeAt(7);
    const isTruck = model === 'C' || model === 'T';
    const fuelLabel = model === 'S' && ['A', 'B', 'C', 'D'].includes(fuelCode) ? 'Charger type' : 'Fuel / battery type';
    const body = lookup(bodyTable, bodyCode, 'Body');
    const restraint = lookup(restraintTable, restraintCode, isTruck ? 'GVWR' : 'Restraints');
    let fuel = lookup(data?.fuel, fuelCode, fuelLabel);
    if (fuelCode === 'E' && ['3', 'Y'].includes(model) && wmi === 'LRW') fuel = 'Electric · ternary lithium-ion battery';
    const motorData = lookup(data?.motor, motorCode, 'Motor');
    const plantData = lookup(PLANTS, plantCode, 'Plant');
    const checkDigit = codeAt(8);
    const expected = expectedCheckDigit(v);
    const checksumValid = expected === null ? null : checkDigit === expected;
    if (checksumValid === false) issues.push(`Check digit mismatch: position 9 is ${checkDigit}; calculated value is ${expected}. Verify the VIN.`);
    if (expected === null && checkDigit && !/^[0-9X]$/.test(checkDigit)) issues.push(`Invalid check digit ${checkDigit}; expected 0–9 or X.`);
    const sequence = v.length > 11 ? v.slice(11) : null;
    const series = { A: 'Alpha prototype', B: 'Beta prototype', F: 'Founder series', P: 'Production', R: 'Release candidate', S: 'Signature series' };
    let sequenceMeaning = 'Production sequence';
    if (sequence && series[sequence[0]]) sequenceMeaning = `${series[sequence[0]]} · sequence ${sequence.slice(1) || 'not supplied'}`;

    const decoded = {
        v, wmi, wmiMeaning: WMI_INFO[wmi], model, modelCode, modelLabel: MODELS[model] ?? null,
        providedLen: v.length, isPartial: v.length < 17 || v.includes('*'),
        yearCode, year, yearType: ['LRW', 'XP7'].includes(wmi) ? 'Calendar year' : 'Model year',
        bodyCode, body, restraintCode, restraint, restraintLabel: isTruck ? 'Gross vehicle weight rating' : 'Restraint system',
        fuelCode, fuel, fuelLabel, motorCode, motorData, plantCode, plantData,
        checkDigit, expectedCheckDigit: expected, checksumValid, sequence, sequenceMeaning, issues
    };
    decoded.trim = inferTeslaTrim(decoded);
    return decoded;
}

const vinInput = document.getElementById('vinInput');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('decodeResult');
const copyLinkButton = document.getElementById('copyLink');
const shareStatusEl = document.getElementById('shareStatus');

function vinFromURL() {
    const url = new URL(window.location.href);
    const encoded = url.protocol === 'file:' ? url.hash.slice(1) : url.pathname.match(/^\/vin\/([^/]+)\/?$/)?.[1];
    if (encoded !== undefined) {
        try { return decodeURIComponent(encoded); }
        catch { return encoded; }
    }
    return url.searchParams.get('vin') || '';
}

function syncVINURL(vin) {
    const url = new URL(window.location.href);
    const value = /^[A-HJ-NPR-Z0-9*]{1,17}$/.test(vin) ? vin : '';
    if (url.protocol === 'file:') {
        url.hash = value ? encodeURIComponent(value) : '';
    } else if (url.protocol === 'http:' || url.protocol === 'https:') {
        url.pathname = value ? `/vin/${encodeURIComponent(value)}` : '/vin';
    } else {
        return false;
    }
    url.searchParams.delete('vin');
    if (url.href !== window.location.href) {
        try {
            // Keep typing from adding a history entry for every character.
            window.history.replaceState(window.history.state, '', url.href);
        } catch {
            return false;
        }
    }
    return Boolean(value);
}

function renderResult(decoded) {
    resultEl.style.display = 'block';
    const set = (id, value) => { document.getElementById(id).textContent = value ?? 'Not supplied'; };
    set('wmiValue', decoded.wmi);
    set('wmiMeaning', decoded.wmiMeaning);
    set('yearLabel', decoded.yearType);
    set('yearValue', decoded.year ?? (decoded.yearCode ? `Unknown (${decoded.yearCode})` : '—'));
    set('yearNote', decoded.yearCode ? `Position 10: ${decoded.yearCode} · ${decoded.yearType}` : 'Year position not supplied');
    set('plantValue', decoded.plantCode ?? '—');
    set('plantMeaning', decoded.plantData);
    set('motorValue', decoded.motorCode ?? '—');
    set('motorMeaning', decoded.motorData);
    const badge = document.getElementById('eraBadge');
    badge.style.display = decoded.model ? 'inline-flex' : 'none';
    badge.textContent = [decoded.modelLabel, decoded.year].filter(Boolean).join(' · ');
    badge.classList.toggle('partial-badge', decoded.isPartial);

    const tbody = document.getElementById('tableBody');
    tbody.replaceChildren();
    function row(position, code, label, meaning) {
        const tr = document.createElement('tr');
        const posCell = document.createElement('td');
        const pos = document.createElement('span');
        pos.className = 'position';
        pos.textContent = position;
        posCell.append(pos);
        const codeCell = document.createElement('td');
        codeCell.textContent = code ?? '—';
        const meaningCell = document.createElement('td');
        const title = document.createElement('strong');
        title.textContent = label;
        const detail = document.createElement('div');
        detail.textContent = meaning ?? 'Not supplied';
        detail.className = meaning === null ? 'missing' : 'meaning';
        meaningCell.append(title, detail);
        tr.append(posCell, codeCell, meaningCell);
        tbody.append(tr);
    }
    row('1–3', decoded.wmi, 'Manufacturer', decoded.wmiMeaning);
    row('4', decoded.modelCode, 'Model', decoded.modelLabel ?? (decoded.modelCode ? 'Unknown model for this manufacturer' : 'Enter position 4 to identify the model'));
    row('5', decoded.bodyCode, decoded.model === 'C' ? 'Body / cab / restraints' : 'Body / cab type', decoded.body);
    row('6', decoded.restraintCode, decoded.restraintLabel, decoded.restraint);
    row('7', decoded.fuelCode, decoded.fuelLabel, decoded.fuel);
    row('8', decoded.motorCode, 'Motor / drive unit', decoded.motorData);
    const checkMeaning = decoded.checksumValid === true ? 'Correct'
        : decoded.checksumValid === false ? `Mismatch · expected ${decoded.expectedCheckDigit}`
        : 'A complete VIN without wildcards is needed to verify the check digit';
    row('9', decoded.checkDigit, 'Check digit', checkMeaning);
    row('10', decoded.yearCode, decoded.yearType, decoded.year ? String(decoded.year) : decoded.yearCode ? 'Unknown year code' : null);
    row('11', decoded.plantCode, 'Manufacturing plant', decoded.plantData);
    row('12–17', decoded.sequence, 'Serial / production series', decoded.sequence ? decoded.sequenceMeaning : null);

    set('trimValue', decoded.trim.vehicleLabel);
    set('trimStatus', { inferred: 'Estimated trim', ambiguous: 'Several possible trims', configuration: 'Drivetrain identified', unknown: 'Trim not determined' }[decoded.trim.status]);
    set('trimReason', decoded.trim.reason);
    const trimSource = document.getElementById('trimSource');
    trimSource.replaceChildren();
    if (decoded.trim.source) {
        const link = document.createElement('a');
        link.textContent = decoded.trim.source.label;
        link.href = decoded.trim.source.url;
        trimSource.append(link);
    }
}

function updateDecoder() {
    const vin = normalizeVIN(vinInput.value);
    if (vin !== vinInput.value) vinInput.value = vin;
    const hasShareURL = syncVINURL(vin);
    copyLinkButton.disabled = true;
    shareStatusEl.textContent = '';
    if (!vin) {
        statusEl.textContent = '';
        resultEl.style.display = 'none';
        return;
    }
    const decoded = decodeVIN(vin);
    if (decoded.error) {
        statusEl.className = 'status error';
        statusEl.textContent = decoded.error;
        resultEl.style.display = 'none';
        return;
    }
    copyLinkButton.disabled = !hasShareURL;
    const messages = [];
    if (!decoded.modelCode) messages.push(`Enter position 4 (${WMI_MODELS[decoded.wmi].map(code => `${code} = ${MODELS[code]}`).join(', ')}).`);
    if (decoded.isPartial) messages.push(`Partial VIN · ${decoded.providedLen} of 17 positions supplied${vin.includes('*') ? ' · wildcards present' : ''}.`);
    messages.push(...decoded.issues);
    if (!messages.length) messages.push(`${decoded.modelLabel} decoded · check digit correct.`);
    statusEl.className = `status ${decoded.issues.length ? 'warning' : 'success'}`;
    statusEl.textContent = messages.join(' ');
    renderResult(decoded);
}

vinInput.addEventListener('input', updateDecoder);
copyLinkButton.addEventListener('click', async () => {
    if (copyLinkButton.disabled) return;
    const shareURL = window.location.href;
    try {
        await navigator.clipboard.writeText(shareURL);
        if (window.location.href === shareURL) shareStatusEl.textContent = 'Link copied';
    } catch {
        if (window.location.href === shareURL) shareStatusEl.textContent = 'Copy the link from your address bar.';
    }
});
function restoreVINFromURL() {
    vinInput.value = vinFromURL();
    updateDecoder();
}
window.addEventListener('popstate', restoreVINFromURL);
window.addEventListener('hashchange', () => {
    if (window.location.protocol === 'file:') restoreVINFromURL();
});
restoreVINFromURL();
