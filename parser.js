const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

// Shift the decimal exactly so converting report values introduces no
// floating-point rounding artifacts (including scientific notation).
function shiftDecimal(value, places) {
  const [, sign, whole, fraction = '', exponent = '0'] = value.match(/^([+-]?)(\d*)\.?([\d]*)(?:[eE]([+-]?\d+))?$/);
  const digits = whole + fraction;
  const point = whole.length + Number(exponent) + places;
  let result = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
    : `${digits.slice(0, point)}.${digits.slice(point)}`;
  result = result.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return sign === '-' && /[1-9]/.test(result) ? `-${result}` : result;
}

/** Read the standard SWMM summary shared by junctions, storage and outfalls. */
export function parseReport(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(line => /^\s*Node Inflow Summary\s*$/i.test(line));
  if (start < 0) throw new Error('No Node Inflow Summary found. Choose a full SWMM/PCSWMM simulation report with summary results enabled.');
  const section = [];
  let rules = 0;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\*{3,}\s*$/.test(line)) {
      if (rules >= 2) break;
      continue;
    }
    if (/^\s*-{5,}\s*$/.test(line)) {
      rules++;
      if (rules > 2) break;
      continue;
    }
    if (rules >= 2 && !line.trim()) break;
    section.push(line);
  }
  const header = section.find(line => /^\s*Node\s+Type\s+/i.test(line));
  if (!header) throw new Error('The Node Inflow Summary header is missing or unsupported.');
  const flowUnit = header.match(/\b(CFS|GPM|MGD|CMS|LPS|MLD)\b/i)?.[1].toUpperCase();
  const sourceVolumeUnit = header.match(/\b(?:10\^6\s*(?:gal|ltr)|ltr)\b/i)?.[0].replace(/\s+/g, ' ');
  if (!flowUnit || !sourceVolumeUnit) throw new Error('Could not read flow and volume units from the summary header. No unit conversion was assumed.');
  const liters = /ltr$/i.test(sourceVolumeUnit);
  const volumeUnit = liters ? 'm³' : sourceVolumeUnit;
  const volumeShift = /^10\^6/i.test(sourceVolumeUnit) ? 3 : -3;
  const nodes = new Map();
  for (const line of section) {
    const match = line.match(/^\s*(.+?)\s+(JUNCTION|STORAGE|OUTFALL|DIVIDER)\s+(.+)$/i);
    if (!match) continue;
    const fields = match[3].trim().split(/\s+/);
    // Lateral peak, total peak, day, hh:mm, lateral volume, total volume, balance.
    if (fields.length < 7 || ![0, 1, 2, 4, 5, 6].every(i => number.test(fields[i])) || !/^\d{2}:\d{2}$/.test(fields[3])) {
      throw new Error(`Cannot read results for node “${match[1]}”. The row is incomplete or uses an unsupported format.`);
    }
    const id = match[1].trim();
    if (nodes.has(id)) throw new Error(`Duplicate node “${id}” in the summary. Please choose a single simulation report.`);
    nodes.set(id, { id, type: match[2].toUpperCase(), peakFlow: fields[1], totalInflow: liters ? shiftDecimal(fields[5], volumeShift) : fields[5], peakTime: `${fields[2]}d ${fields[3]}` });
  }
  if (!nodes.size) throw new Error('The Node Inflow Summary contains no readable node results.');
  const warnings = lines.filter(line => /^\s*ERROR\s+\d+/i.test(line)).map(line => line.trim());
  return { nodes, flowUnit, volumeUnit, sourceVolumeUnit, warnings };
}

export function selectNodes(report, input) {
  const ids = [...new Set(input.split(/[\n\r,;\t]+/).map(id => id.trim()).filter(Boolean))];
  return ids.map(id => report.nodes.get(id) ?? { id, type: '', peakFlow: '', totalInflow: '', peakTime: '', missing: true });
}

function csvRecords(records) {
  const escape = value => {
    let text = String(value);
    // Prevent spreadsheet formulas in user-controlled node IDs.
    if (/^[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + records.map(row => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

export function toCsv(rows, report) {
  return csvRecords([
    ['Node ID', 'Node type', `Peak flow (${report.flowUnit})`, `Total inflow volume (${report.volumeUnit})`, 'Time of peak (days hh:mm)', 'Status'],
    ...rows.map(row => [row.id, row.type, row.peakFlow, row.totalInflow, row.peakTime, row.missing ? 'Not found' : 'Found'])
  ]);
}

export function labelModels(models) {
  const used = new Set();
  return models.map(model => {
    let label = model.name;
    let suffix = 2;
    while (used.has(label)) label = `${model.name} (${suffix++})`;
    used.add(label);
    return { ...model, label };
  });
}

export function selectBatch(models, input) {
  const ids = [...new Set(input.split(/[\n\r,;\t]+/).map(id => id.trim()).filter(Boolean))];
  return ids.map(id => ({ id, models: models.map(model => {
    if (!model.report) return { id, type: '', peakFlow: '', totalInflow: '', peakTime: '', error: true };
    return model.report.nodes.get(id) ?? { id, type: '', peakFlow: '', totalInflow: '', peakTime: '', missing: true };
  }) }));
}

export function batchToCsv(rows, models) {
  const headers = ['Node ID'];
  for (const model of models) {
    const prefix = model.label ?? model.name;
    headers.push(`${prefix} — Node type`, `${prefix} — Peak flow${model.report ? ` (${model.report.flowUnit})` : ''}`,
      `${prefix} — Total inflow volume${model.report ? ` (${model.report.volumeUnit})` : ''}`,
      `${prefix} — Time of peak (days hh:mm)`, `${prefix} — Status`);
  }
  return csvRecords([headers, ...rows.map(row => [row.id, ...row.models.flatMap(result => [
    result.type, result.peakFlow, result.totalInflow, result.peakTime,
    result.error ? 'Report error' : result.missing ? 'Not found' : 'Found'
  ])])]);
}
