/* Best-effort retail labels, not individual build records. Classic script for
 * offline use. Primary sources and catalog limitations: docs/tesla-trim-research.md. */
const TESLA_TRIM_MOTORS = {
    S: { rwd: ['1', 'C', 'G', 'N'], performanceRwd: ['3', 'P'], awd: ['2', '5'], performance: ['4'], tri: ['6'] },
    X: { awd: ['2', '5'], performance: ['4'], tri: ['6'] },
    '3': { rwd: ['A', 'J', 'R', 'S'], awd: ['B', 'K'], performance: ['C', 'T'] },
    Y: { rwd: ['D', 'J', 'R', 'S'], awd: ['E', 'K'], performance: ['F', 'L'] },
    C: { rwd: ['C'], awd: ['D'], tri: ['E'] }
};
const TESLA_TRIM_SOURCE = 'https://service.tesla.com/docs/ModelS/ServiceManual/Palladium/en-us/GUID-C79EB66B-D6DB-4439-BFC4-6AB53FB19E2C.html';

function inferTeslaTrim(decoded) {
    const { model, motorCode, year, wmi, bodyCode } = decoded;
    const drive = Object.entries(TESLA_TRIM_MOTORS[model] || {}).find(([, codes]) => codes.includes(motorCode))?.[0];
    const family = {
        rwd: 'Rear-Wheel Drive', performanceRwd: 'Performance RWD',
        awd: 'Dual Motor AWD', performance: 'Performance AWD', tri: 'Tri Motor AWD'
    }[drive];
    const result = (label, status, reason, candidates = [], source = null) => {
        const inputNotes = [];
        if (decoded.checksumValid === false) inputNotes.push('Check digit mismatch: verify the VIN before relying on this estimate.');
        if (decoded.isPartial) inputNotes.push('Based on the supplied VIN positions.');
        return {
            label, status, candidates, reason: [...inputNotes, reason].join(' '), source,
            vehicleLabel: ([year, decoded.modelLabel].filter(Boolean).join(' ') || 'Tesla') + ` · ${label}`
        };
    };
    if (!model || !drive) {
        const reason = model === 'T' ? 'The VIN does not identify the Semi range or battery configuration.'
            : model === 'A' ? 'A retail trim is not established by the published Cybercab VIN data.'
            : 'A recognized model and motor code are needed to estimate a trim.';
        return result('Trim unknown', 'unknown', reason);
    }

    // Keep undocumented years readable without assigning today's retail names.
    if (!year || year > 2026) {
        return result(family, 'configuration', year ? 'The drivetrain is decoded; retail trims for this year have not been verified.'
            : 'Add the year at position 10 to narrow the retail trim.');
    }

    if (['S', 'X'].includes(model) && ['5', '6'].includes(motorCode)) {
        if (year < 2021) return result('Trim unknown', 'unknown', 'This model year predates the documented P2 drivetrain. Verify the VIN.');
        if (motorCode === '6') return result('Plaid', 'inferred', 'The P2 tri-motor configuration matches Plaid. Individual options and upgrades are not encoded.', ['Plaid'], { label: 'Tesla VIN definitions', url: TESLA_TRIM_SOURCE });
        // Range-limited and full-range versions can share P2 dual-motor VINs.
        return result(family, 'configuration', 'P2 dual motor is identified. The VIN does not distinguish the retail range tier.', [], { label: 'Tesla VIN definitions', url: TESLA_TRIM_SOURCE });
    }
    if (model === 'C') {
        if (year < 2024) return result('Trim unknown', 'unknown', 'This year is outside the verified Cybertruck trim records.');
        if (drive === 'tri') return result('Cyberbeast', 'inferred', 'The performance tri-motor configuration matches Cyberbeast. Foundation Series and other packages are not identified.', ['Cyberbeast'], { label: 'Tesla Cybertruck', url: 'https://www.tesla.com/cybertruck' });
        return result(family, 'configuration', 'The drivetrain is identified; edition, equipment and range packages need vehicle-specific records.');
    }

    // US manufacture alone does not establish the sales market. Do not apply
    // US catalogs to Shanghai/Berlin cars or a right-hand-drive descriptor.
    const usBuiltLhd = ['5YJ', '7SA'].includes(wmi) && bodyCode === { S: 'A', X: 'C', '3': 'E', Y: 'G' }[model];
    if (!usBuiltLhd) {
        return result(family, 'configuration', 'The drivetrain is identified. This US trim catalog cannot establish the retail name for this manufacturer or body configuration.');
    }
    if (['3', 'Y'].includes(model) && decoded.fuelCode === 'F') {
        return result(family, 'configuration', 'An LFP battery and the drivetrain are identified. The catalog does not provide enough battery-specific detail to establish the retail range tier.');
    }
    // Legacy S/X and P2 production overlap in 2021; never apply legacy
    // P100D/Long Range Plus rows to motor 5/6 or later model years.
    const canUseCatalog = !['S', 'X'].includes(model) || (year >= 2015 && year <= 2021);
    const candidates = canUseCatalog ? [...(TESLA_TRIM_CATALOG[year]?.[model]?.[drive] || [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [];
    if (!candidates.length) {
        return result(family, 'configuration', 'The drivetrain is identified. The available model-year records do not resolve a more specific retail trim.');
    }
    const source = { label: `${year} EPA / DOE US catalog`, url: `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=Tesla` };
    const scope = 'Estimate from US model-year listings. Export names, unlisted variants and software upgrades can differ.';
    if (candidates.length === 1) {
        return result(candidates[0], 'inferred', `One catalog trim matches the model, year and motor category. ${scope}`, candidates, source);
    }
    // Short legacy badge alternatives make a useful final label; longer lists
    // stay in the explanation instead of producing an unwieldy vehicle title.
    const label = candidates.length <= 3 && candidates.every(candidate => /^P?\d+D?$/.test(candidate)) ? candidates.join(' / ') : family;
    return result(label, 'ambiguous', `Possible trims: ${candidates.join(', ')}. The VIN does not distinguish between them. ${scope}`, candidates, source);
}
