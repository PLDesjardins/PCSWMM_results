import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, selectNodes, toCsv } from '../parser.js';

// Header and row layout follow EPA SWMM statsrpt.c writeNodeFlows.
const fixture = (unit = 'CMS', volume = '10^6 ltr') => `
  *******************
  Node Inflow Summary
  *******************

  -------------------------------------------------------------------------------------------------
                                  Maximum  Maximum                  Lateral       Total        Flow
                                  Lateral    Total  Time of Max      Inflow      Inflow     Balance
                                   Inflow   Inflow   Occurrence      Volume      Volume       Error
  Node                 Type           ${unit}      ${unit}  days hr:min    ${volume}    ${volume}     Percent
  -------------------------------------------------------------------------------------------------
  J1                   JUNCTION     0.123    2.456     0  01:30       0.111        9.87       0.000
  S1                   STORAGE      0.000    3.4e+02   2  14:15       0.000    1.23e+03       0.000
  O1                   OUTFALL      0.000    0.000     0  00:00       0.000           0       0.000 gal

  *******************
  Node Flooding Summary
  *******************
  fake                 JUNCTION     9.999    9.999     0  01:30       9.999       9.999       0.000
`;

test('extracts total peak and total volume, not lateral flow, across node types', () => {
  const report = parseReport(fixture());
  assert.equal(report.nodes.size, 3);
  assert.deepEqual(report.nodes.get('J1'), { id: 'J1', type: 'JUNCTION', peakFlow: '2.456', totalInflow: '9870', peakTime: '0d 01:30' });
  assert.equal(report.nodes.get('S1').peakFlow, '3.4e+02');
  assert.equal(report.nodes.get('S1').totalInflow, '1230000');
  assert.equal(report.nodes.get('O1').totalInflow, '0');
  assert.equal(report.flowUnit, 'CMS');
  assert.equal(report.volumeUnit, 'm³');
  assert.equal(report.sourceVolumeUnit, '10^6 ltr');
});

test('supports Windows line endings and all standard flow units', () => {
  for (const unit of ['CFS', 'GPM', 'MGD', 'CMS', 'LPS', 'MLD']) {
    const report = parseReport(fixture(unit, '10^6 gal').replaceAll('\n', '\r\n'));
    assert.equal(report.flowUnit, unit);
    assert.equal(report.volumeUnit, '10^6 gal');
    assert.equal(report.nodes.size, 3);
  }
});

test('retains selection order, removes duplicates and flags missing nodes', () => {
  const rows = selectNodes(parseReport(fixture()), 'S1, J1;O1\nJ1\tj1\nmissing');
  assert.deepEqual(rows.map(row => row.id), ['S1', 'J1', 'O1', 'j1', 'missing']);
  assert.equal(rows[3].missing, true);
  assert.equal(rows[3].peakFlow, '');
});

test('exports units, zero values, missing status and escaped spreadsheet cells', () => {
  const report = parseReport(fixture());
  const rows = selectNodes(report, 'O1\n=SUM(A1)\na"b');
  const csv = toCsv(rows, report);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('Peak flow (CMS)'));
  assert.ok(csv.includes('Total inflow volume (m³)'));
  assert.ok(csv.includes('"O1","OUTFALL","0.000","0"'));
  assert.ok(csv.includes('"\'=SUM(A1)"'));
  assert.ok(csv.includes('"a""b"'));
  assert.ok(csv.includes('"Not found"'));
});

test('rejects absent summaries, unknown units, malformed rows and duplicate IDs', () => {
  assert.throws(() => parseReport('not a report'), /No Node Inflow Summary/);
  assert.throws(() => parseReport(fixture('UNKNOWN')), /units/);
  assert.throws(() => parseReport(fixture().replace('2.456', '*****')), /Cannot read results/);
  assert.throws(() => parseReport(fixture().replace('S1                   STORAGE', 'J1                   STORAGE')), /Duplicate node/);
});

test('reports simulation errors alongside parsed results', () => {
  const report = parseReport(`ERROR 103: cannot solve network.\n${fixture()}`);
  assert.deepEqual(report.warnings, ['ERROR 103: cannot solve network.']);
});

test('converts liter volumes exactly, with small values and scientific notation', () => {
  for (const [input, expected] of [['1.001', '1001'], ['1.234e-6', '0.001234'], ['0.000', '0'], ['.001', '1'], ['12.6', '12600']]) {
    const report = parseReport(fixture().replace('9.87', input));
    assert.equal(report.nodes.get('J1').totalInflow, expected);
    assert.ok(toCsv(selectNodes(report, 'J1'), report).includes(`"${expected}"`));
  }
  const liters = parseReport(fixture('LPS', 'ltr'));
  assert.equal(liters.nodes.get('J1').totalInflow, '0.00987');
  assert.equal(liters.volumeUnit, 'm³');
  const gallons = parseReport(fixture('CFS', '10^6 gal'));
  assert.equal(gallons.nodes.get('J1').totalInflow, '9.87');
  assert.equal(gallons.volumeUnit, '10^6 gal');
});
