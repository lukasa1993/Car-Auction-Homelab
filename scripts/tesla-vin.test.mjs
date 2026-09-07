import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const script = ['tesla-trim-catalog.js', 'tesla-trims.js', 'tesla-vin.js']
    .map(file => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8')).join('\n');
const sharedSource = stripTypeScriptTypes(readFileSync(new URL('../src/lib/vin-patterns.ts', import.meta.url), 'utf8'));
const shared = await import(`data:text/javascript;base64,${Buffer.from(sharedSource).toString('base64')}`);

function page(initialURL = 'https://auc.ldev.cloud/vin.html', { clipboardFails = false, historyFails = false } = {}) {
    function element() {
        const listeners = new Map();
        return {
            value: '', textContent: '', className: '', style: {}, children: [],
            classList: { toggle() {} },
            addEventListener(name, fn) { listeners.set(name, fn); },
            dispatch(name) { return listeners.get(name)?.(); },
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; }
        };
    }
    const nodes = new Map();
    const document = {
        getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, element());
            return nodes.get(id);
        },
        createElement: element
    };
    const windowListeners = new Map();
    const copied = [];
    const historyWrites = [];
    const window = {
        location: new URL(initialURL),
        addEventListener(name, fn) { windowListeners.set(name, fn); },
        history: {
            state: null,
            replaceState(state, title, url) {
                if (historyFails) throw new Error('History API unavailable');
                historyWrites.push(url);
                window.location = new URL(url);
            }
        }
    };
    const navigator = { clipboard: { async writeText(value) {
        if (clipboardFails) throw new Error('Clipboard unavailable');
        copied.push(value);
    } } };
    const context = vm.createContext({ document, window, navigator, URL });
    vm.runInContext(script, context);
    return {
        decode: context.decodeVIN,
        nodes, copied, historyWrites,
        get url() { return window.location.href; },
        navigate(url, event = 'popstate') {
            window.location = new URL(url);
            windowListeners.get(event)?.();
        },
        enter(value) {
            nodes.get('vinInput').value = value;
            context.updateDecoder();
        }
    };
}

// Descriptor fixtures below are deliberately partial VINs. They exercise
// Tesla's published code meanings, not an invented vehicle registration.
const configurations = [
    ['original report', '5YJSA1E59PF531239', 'Model S', 2023, 'Dual motor · P2', 'Fremont'],
    ['early S charger and battery tier', '5YJSA1DP*C', 'Model S', 2012, 'Performance AC induction motor', null],
    ['legacy S dual motor', '5YJSA7E2*H', 'Model S', 2017, 'Dual motor · standard', null],
    ['S Plaid', '5YJSA1E6*P', 'Model S', 2023, 'Tri motor', null],
    ['legacy X', '5YJXCAE2*G', 'Model X', 2016, 'Dual motor · standard', null],
    ['legacy X performance', '5YJXCAE4*L', 'Model X', 2020, 'Dual motor · performance', null],
    ['2021 legacy X', '5YJXCAE4*M', 'Model X', 2021, 'Dual motor · performance', null],
    ['2021 refresh X', '5YJXCAE5*M', 'Model X', 2021, 'Dual motor · P2', null],
    ['7SA X Plaid', '7SAXCAE6*PF', 'Model X', 2023, 'Tri motor', 'Fremont'],
    ['early Model 3', '5YJ3E1EA*H', 'Model 3', 2017, 'Single motor', null],
    ['2024 previous Model 3', '5YJ3E1EC*R', 'Model 3', 2024, 'Dual motor · performance', null],
    ['2024 refresh Model 3', '5YJ3E1ET*R', 'Model 3', 2024, 'Dual motor · performance', null],
    ['Shanghai RHD LFP Model 3', 'LRW3F7FJ*SC', 'Model 3', 2025, 'Single motor', 'Shanghai'],
    ['Fremont Y', '5YJYGDEE*MF', 'Model Y', 2021, 'Dual motor', 'Fremont'],
    ['Austin Y', '7SAYGDEE*PA', 'Model Y', 2023, 'Dual motor', 'Austin'],
    ['Berlin Y', 'XP7YGCEK*PB', 'Model Y', 2023, 'Dual motor', 'Berlin'],
    ['Shanghai Y', 'LRWYHCEJ*PC', 'Model Y', 2023, 'Single motor', 'Shanghai'],
    ['2027 Y', '7SAYGBEE*VA', 'Model Y', 2027, 'Dual motor', 'Austin'],
    ['Cybertruck AWD', '7G2CEHED*RA', 'Cybertruck', 2024, 'Dual motor', 'Austin'],
    ['Cyberbeast', '7G2CEHEE*SA', 'Cybertruck', 2025, 'Tri motor', 'Austin'],
    ['Cybertruck RWD', '7G2CEGEC*TA', 'Cybertruck', 2026, 'Single motor', 'Austin'],
    ['Semi short cab', '7G2TAEEB*PN', 'Semi', 2023, 'Dual-drive rear axle', 'Reno'],
    ['Semi day cab', '7G2TBEEB*RN', 'Semi', 2024, 'Dual-drive rear axle', 'Reno'],
    ['NHTSA Cybercab example', '5YJAJEEU9TAR03017', 'Cybercab', 2026, 'Unknown code U', 'Austin']
];
for (const [name, vin, model, year, motor, plant] of configurations) {
    test(`decodes ${name} in the page and shared auction code`, () => {
        const { decode } = page();
        const result = decode(vin);
        assert.equal(result.error, undefined);
        assert.equal(result.modelLabel, model);
        assert.equal(result.year, year);
        assert.ok(result.motorData.includes(motor), result.motorData);
        if (plant) assert.ok(result.plantData.includes(plant));
        if (model !== 'Cybercab') assert.equal(result.issues.length, 0, result.issues.join(' '));
        const target = shared.decodeTeslaVin(vin);
        assert.equal(target.modelLabel, model);
        assert.equal(target.year, year);
        assert.equal(shared.getVinTargetValidationError(vin), null);
    });
}

test('checks real VINs including a valid X checksum, without rejecting useful fields on mismatch', () => {
    const { decode } = page();
    assert.equal(decode('5YJSA1E59PF531239').checksumValid, true);
    assert.equal(decode('5YJSA1E5XMF446776').checksumValid, true);
    const mismatch = decode('5YJSA1E59PF531230');
    assert.equal(mismatch.checksumValid, false);
    assert.equal(mismatch.modelLabel, 'Model S');
    assert.ok(mismatch.issues.some(issue => issue.includes('Check digit mismatch')));
    assert.equal(decode('5YJSA1E5*PF531239').checksumValid, null);
});

test('7SA remains ambiguous and invalid model letters do not fall back to Model Y', () => {
    const { decode } = page();
    for (const vin of ['7SA', '7SA******P', 'XP7Z*****P', '7SAS*****P', 'LRWS*****P', '5YJC*****P']) {
        assert.equal(decode(vin).model, null, vin);
        assert.equal(shared.inferTeslaModel(vin), null, vin);
    }
    assert.equal(decode('XP7').modelLabel, 'Model Y');
    assert.equal(shared.inferTeslaModel('XP7').label, 'Model Y');
});

test('normalizes pasted whitespace, lowercase and wildcard masks', () => {
    const p = page();
    p.enter(' 5yjsa1e5\n9pf531239 ');
    assert.equal(p.nodes.get('vinInput').value, '5YJSA1E59PF531239');
    assert.match(p.nodes.get('status').textContent, /check digit correct/);
    const masked = p.decode('5yj?a1e5?pf531239');
    assert.equal(masked.year, 2023);
    assert.equal(masked.model, null);
    assert.equal(masked.isPartial, true);
    assert.equal(masked.checksumValid, null);
});

test('excludes the original Roadster and explains malformed or unsupported input', () => {
    const { decode } = page();
    for (const vin of ['SFZRE11B381000001', '5YJRE11B281000001']) {
        assert.match(decode(vin).error, /original Tesla Roadster/);
        assert.equal(shared.decodeTeslaVin(vin), null);
    }
    assert.match(decode('5Y').error, /at least 3/);
    assert.match(decode('5YJSA1E59PF5312399').error, /longer than 17/);
    assert.match(decode('5YJSA1EI9PF531239').error, /no I, O or Q/);
    assert.match(decode('WVWZZZ').error, /Unknown Tesla manufacturer/);
    assert.ok(decode('5YJSA1E5*UF').issues.some(issue => issue.includes('Unknown year')));
});

test('unknown fields stay distinct from omitted fields and do not erase known data', () => {
    const { decode } = page();
    const result = decode('5YJSA1EZ*PZ');
    assert.match(result.motorData, /Unknown code Z/);
    assert.match(result.plantData, /Unknown code Z/);
    assert.equal(result.year, 2023);
    assert.equal(decode('5YJS').motorData, null);
    assert.equal(decode('5YJS').year, null);
    assert.ok(decode('5YJAJEEU9TAR03017').issues.some(issue => issue.includes('Motor')));
});

test('handles early S body meanings, chargers and letter-prefixed production series', () => {
    const { decode } = page();
    const early = decode('5YJSB1DP*CFP00001');
    assert.match(early.body, /left-hand drive.*all-wheel drive/);
    assert.equal(early.fuelLabel, 'Charger type');
    assert.match(early.fuel, /20 kW.*DC fast/);
    assert.match(early.sequenceMeaning, /Production.*00001/);
    assert.match(decode('5YJSB7E2*HF').body, /right-hand drive/);
    assert.match(decode('5YJSB').body, /year needed/);
});

test('truck rows use GVWR while passenger vehicles use restraints', () => {
    const { decode } = page();
    assert.equal(decode('7G2CEHED*RA').restraintLabel, 'Gross vehicle weight rating');
    assert.match(decode('7G2CEHED*RA').restraint, /9,001–10,000/);
    assert.match(decode('7G2TBEEB*RN').restraint, /class 8/);
    assert.equal(decode('7SAXCAE5*PF').restraintLabel, 'Restraint system');
});

test('global year and plant meanings are independent of model inference and drivetrain generation', () => {
    const { decode } = page();
    assert.equal(decode('7SA******PF').plantData, 'Fremont, California, USA');
    assert.equal(decode('LRW3E7EK*PC').yearType, 'Calendar year');
    assert.equal(decode('XP7YGCEK*PB').yearType, 'Calendar year');
    assert.equal(decode('5YJSA1E5*PF').yearType, 'Model year');
    const future = decode('5YJSA1E5*1F');
    assert.equal(future.year, 2031);
    assert.ok(future.issues.some(issue => issue.includes('not yet verified')));
    assert.equal(shared.decodeTeslaVin('5YJSA1E5*1F').year, 2031);
});

test('renders every model, then clears stale results on invalid and empty input', () => {
    const p = page();
    for (const [, vin, model] of configurations) {
        p.enter(vin);
        assert.equal(p.nodes.get('decodeResult').style.display, 'block');
        assert.match(p.nodes.get('eraBadge').textContent, new RegExp(model));
        assert.equal(p.nodes.get('tableBody').children.length, 10);
    }
    p.enter('LRW3E7EK*PC');
    assert.equal(p.nodes.get('yearLabel').textContent, 'Calendar year');
    p.enter('5YJSA1E59PF531239');
    assert.equal(p.nodes.get('yearLabel').textContent, 'Model year');
    p.enter('<script>');
    assert.equal(p.nodes.get('decodeResult').style.display, 'none');
    p.enter('');
    assert.equal(p.nodes.get('status').textContent, '');
    assert.equal(p.nodes.get('decodeResult').style.display, 'none');
});

test('infers P100D for the documented 2018 VIN, retaining US-market provenance', () => {
    const trim = page().decode('5YJSA1E47JF285662').trim;
    assert.equal(trim.label, 'P100D');
    assert.equal(trim.status, 'inferred');
    assert.equal(trim.vehicleLabel, '2018 Model S · P100D');
    assert.match(trim.source.url, /year=2018&make=Tesla/);
    assert.match(trim.reason, /Export names/);
});

test('keeps different battery badges and transition-year names ambiguous', () => {
    const { decode } = page();
    assert.equal(decode('5YJSA1E4*H').trim.label, 'P90D / P100D');
    assert.equal(decode('5YJSA1E4*G').trim.label, 'P85D / P90D / P100D');
    assert.equal(decode('5YJSA1E2*J').trim.label, '75D / 100D');
    const renamed = decode('5YJSA1E4*K').trim;
    assert.equal(renamed.status, 'ambiguous');
    assert.deepEqual([...renamed.candidates], ['P100D', 'Performance']);
    assert.equal(decode('5YJXCAE4*J').trim.label, 'P100D');
});

test('does not turn the reported P2 VIN or an overlapping refresh into a battery badge', () => {
    const { decode } = page();
    const original = decode('5YJSA1E59PF531239').trim;
    assert.equal(original.vehicleLabel, '2023 Model S · Dual Motor AWD');
    assert.equal(original.status, 'configuration');
    assert.equal(original.candidates.length, 0);
    assert.equal(decode('5YJXCAE5*M').trim.label, 'Dual Motor AWD');
    assert.equal(decode('5YJXCAE4*M').trim.label, 'Performance');
    assert.equal(decode('7SAXCAE6*PF').trim.label, 'Plaid');
    assert.equal(decode('5YJSA1E6*M').trim.label, 'Plaid');
});

test('narrows Model 3/Y trims while retaining shared-motor range alternatives', () => {
    const { decode } = page();
    assert.equal(decode('5YJ3E1EA*H').trim.label, 'Long Range RWD');
    assert.equal(decode('5YJ3E1EB*J').trim.label, 'Long Range AWD');
    const midRange = decode('5YJ3E1EA*J').trim;
    assert.equal(midRange.status, 'ambiguous');
    assert.deepEqual([...midRange.candidates], ['Long Range RWD', 'Mid Range RWD']);
    const y = decode('7SAYGDEE*PA').trim;
    assert.equal(y.label, 'Dual Motor AWD');
    assert.deepEqual([...y.candidates], ['AWD', 'Long Range AWD']);
    assert.equal(decode('5YJ3E1EC*R').trim.label, 'Performance AWD');
    assert.equal(decode('5YJ3E1ET*R').trim.label, 'Performance AWD');
    assert.equal(decode('7SAYGDEE*TA').trim.status, 'ambiguous');
});

test('does not apply US range names to global cars, RHD cars or unmatched LFP variants', () => {
    const { decode } = page();
    for (const vin of ['LRW3F7FJ*SC', 'LRW3E7EJ*SC', 'XP7YGCEK*PB', '5YJSB1E4*JF', '5YJ3E1FJ*SF']) {
        const trim = decode(vin).trim;
        assert.equal(trim.status, 'configuration', vin);
        assert.equal(trim.candidates.length, 0, vin);
        assert.doesNotMatch(trim.label, /Long Range|P100D/, vin);
    }
});

test('handles commercial vehicles, missing fields and unverified years without invented trims', () => {
    const { decode } = page();
    assert.equal(decode('7G2CEHEE*SA').trim.label, 'Cyberbeast');
    assert.equal(decode('7G2CEHED*RA').trim.label, 'Dual Motor AWD');
    assert.equal(decode('7G2CEGEC*TA').trim.label, 'Rear-Wheel Drive');
    for (const vin of ['7G2TBEEB*RN', '5YJAJEEU9TAR03017', '5YJS', '5YJSA1EZ*P', '5YJSA1E6*H']) {
        assert.equal(decode(vin).trim.status, 'unknown', vin);
    }
    for (const vin of ['5YJSA1E4', '7SAYGBEE*VA', '5YJSA1E6*1F', '5YJSA1DP*C']) {
        assert.equal(decode(vin).trim.status, 'configuration', vin);
    }
    assert.equal(decode('5YJ').trim.vehicleLabel, 'Tesla · Trim unknown');
});

test('keeps checksum and partial-input limitations attached to trim estimates', () => {
    const { decode } = page();
    const invalid = decode('5YJSA1E47JF285660').trim;
    assert.match(invalid.reason, /Check digit mismatch/);
    assert.notEqual(invalid.status, 'confirmed');
    assert.match(decode('5YJSA1E4*J').trim.reason, /supplied VIN positions/);
});

test('renders the final trim and clears its source and candidates when the VIN changes', () => {
    const p = page();
    p.enter('5YJSA1E47JF285662');
    assert.equal(p.nodes.get('trimValue').textContent, '2018 Model S · P100D');
    assert.equal(p.nodes.get('trimStatus').textContent, 'Estimated trim');
    assert.equal(p.nodes.get('trimSource').children.length, 1);
    p.enter('5YJSA1E4*H');
    assert.equal(p.nodes.get('trimStatus').textContent, 'Several possible trims');
    p.enter('LRW3F7FJ*SC');
    assert.equal(p.nodes.get('trimSource').children.length, 0);
    assert.doesNotMatch(p.nodes.get('trimReason').textContent, /P100D/);
    p.enter('5YJS');
    assert.equal(p.nodes.get('trimStatus').textContent, 'Trim not determined');
    assert.equal(p.nodes.get('trimValue').textContent, 'Model S · Trim unknown');
});

test('restores a shared VIN and its trim directly from the URL path', () => {
    const p = page('https://auc.ldev.cloud/vin/5yjsa1e47jf285662/');
    assert.equal(p.nodes.get('vinInput').value, '5YJSA1E47JF285662');
    assert.equal(p.nodes.get('trimValue').textContent, '2018 Model S · P100D');
    assert.equal(p.url, 'https://auc.ldev.cloud/vin/5YJSA1E47JF285662');
    assert.equal(p.nodes.get('copyLink').disabled, false);
});

test('typing replaces the URL and clearing or malformed input removes a stale VIN', () => {
    const p = page();
    for (const value of ['5', '5Y', '5YJ', '5YJS', '5YJSA1E59PF531239']) {
        p.enter(value);
        assert.equal(new URL(p.url).pathname, `/vin/${value}`);
    }
    p.enter('<script>');
    assert.equal(new URL(p.url).pathname, '/vin');
    assert.equal(p.nodes.get('copyLink').disabled, true);
    p.enter('5YJSA1E47JF285662');
    p.enter('');
    assert.equal(new URL(p.url).pathname, '/vin');
    assert.equal(p.nodes.get('decodeResult').style.display, 'none');
    assert.equal(p.nodes.get('copyLink').disabled, true);
});

test('shared masks, legacy query links and malformed URI sequences are handled safely', () => {
    const masked = page('https://auc.ldev.cloud/vin/5YJSA1E4%3FH');
    assert.equal(masked.nodes.get('vinInput').value, '5YJSA1E4*H');
    assert.equal(masked.nodes.get('trimValue').textContent, '2017 Model S · P90D / P100D');
    assert.equal(new URL(masked.url).pathname, '/vin/5YJSA1E4*H');
    const query = page('https://auc.ldev.cloud/vin.html?vin=5YJSA1E59PF531239&from=share');
    assert.equal(query.url, 'https://auc.ldev.cloud/vin/5YJSA1E59PF531239?from=share');
    for (const segment of ['%E0%A4%A', '%3Cscript%3E', '5YJ%2F..%2Fadmin']) {
        const p = page(`https://auc.ldev.cloud/vin/${segment}`);
        assert.equal(p.nodes.get('decodeResult').style.display, 'none');
        assert.equal(p.url, 'https://auc.ldev.cloud/vin');
        assert.equal(p.nodes.get('copyLink').disabled, true);
    }
});

test('browser navigation restores the corresponding result without stale trim details', () => {
    const p = page('https://auc.ldev.cloud/vin/5YJSA1E47JF285662');
    p.navigate('https://auc.ldev.cloud/vin/5YJSA1E59PF531239');
    assert.equal(p.nodes.get('trimValue').textContent, '2023 Model S · Dual Motor AWD');
    p.navigate('https://auc.ldev.cloud/vin/5YJSA1E47JF285662');
    assert.equal(p.nodes.get('trimValue').textContent, '2018 Model S · P100D');
    p.navigate('https://auc.ldev.cloud/vin');
    assert.equal(p.nodes.get('vinInput').value, '');
    assert.equal(p.nodes.get('decodeResult').style.display, 'none');
});

test('copy link uses the current VIN and reports clipboard failures honestly', async () => {
    const p = page();
    p.enter('5YJSA1E59PF531239');
    await p.nodes.get('copyLink').dispatch('click');
    assert.deepEqual(p.copied, ['https://auc.ldev.cloud/vin/5YJSA1E59PF531239']);
    assert.equal(p.nodes.get('shareStatus').textContent, 'Link copied');
    p.enter('5YJSA1E47JF285662');
    assert.equal(p.nodes.get('shareStatus').textContent, '');
    await p.nodes.get('copyLink').dispatch('click');
    assert.equal(p.copied.at(-1), 'https://auc.ldev.cloud/vin/5YJSA1E47JF285662');
    const denied = page(p.url, { clipboardFails: true });
    await denied.nodes.get('copyLink').dispatch('click');
    assert.match(denied.nodes.get('shareStatus').textContent, /address bar/);
    assert.equal(denied.copied.length, 0);
});

test('a failed URL update cannot enable copying a stale link or break decoding', () => {
    const p = page('https://auc.ldev.cloud/vin', { historyFails: true });
    p.enter('5YJSA1E59PF531239');
    assert.equal(p.nodes.get('copyLink').disabled, true);
    assert.equal(p.nodes.get('trimValue').textContent, '2023 Model S · Dual Motor AWD');
    assert.equal(p.url, 'https://auc.ldev.cloud/vin');
});

test('local files keep their path and restore a VIN from a fragment', () => {
    const p = page('file:///tmp/decoder/vin.html#5YJSA1E47JF285662');
    assert.equal(p.nodes.get('trimValue').textContent, '2018 Model S · P100D');
    p.enter('5YJSA1E59PF531239');
    assert.equal(p.url, 'file:///tmp/decoder/vin.html#5YJSA1E59PF531239');
    p.navigate('file:///tmp/decoder/vin.html', 'hashchange');
    assert.equal(p.nodes.get('vinInput').value, '');
    assert.equal(p.nodes.get('decodeResult').style.display, 'none');
});
