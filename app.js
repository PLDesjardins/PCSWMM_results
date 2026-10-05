import { parseReport, selectNodes, toCsv } from './parser.js';

const $ = id => document.getElementById(id);
let report = null;
let results = [];
let filename = '';
let loadVersion = 0;
let loadError = '';
let reading = false;

function message(text = '') {
  $('message').textContent = text;
  $('message').hidden = !text;
}

function clearResults() {
  results = [];
  $('rows').replaceChildren();
  $('export').disabled = true;
  $('table-container').hidden = true;
  $('empty').hidden = false;
  message();
}

function refreshButton() {
  $('extract').disabled = reading;
  $('extract-help').textContent = reading ? 'Reading your report…' : loadError || (!report ? 'Choose a report, then enter your node IDs.' : !$('node-list').value.trim() ? 'Report loaded. Enter at least one node ID.' : 'Ready to extract your selected nodes.');
}

function loadText(text, name) {
  report = parseReport(text);
  filename = name;
  $('file-label').textContent = name;
  $('file-info').textContent = `${report.nodes.size} nodes available · ${report.flowUnit} · ${report.volumeUnit}`;
  refreshButton();
  if (report.warnings.length) message(`This report contains simulation errors. Check the simulation before using these results: ${report.warnings.join(' ')}`);
}

$('report-file').addEventListener('change', async event => {
  const version = ++loadVersion;
  clearResults();
  report = null;
  loadError = '';
  reading = false;
  refreshButton();
  const file = event.target.files[0];
  if (!file) {
    $('file-label').textContent = 'Choose a .rpt file';
    $('file-info').textContent = 'Your file is read locally in this browser.';
    return;
  }
  $('file-label').textContent = file.name;
  $('file-info').textContent = 'Reading report…';
  reading = true;
  refreshButton();
  try {
    if (!/\.rpt$/i.test(file.name)) throw new Error('Please choose a .rpt report file.');
    // Avoid freezing the browser on accidentally selected binary/huge files.
    if (file.size > 100 * 1024 * 1024) throw new Error('This report exceeds the 100 MB limit. Use a report with summary results only.');
    const bytes = await file.arrayBuffer();
    if (version !== loadVersion) return;
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1252').decode(bytes); }
    loadText(text, file.name);
  } catch (error) {
    if (version !== loadVersion) return;
    $('file-info').textContent = 'Report could not be read.';
    loadError = error.message;
    message(loadError);
  } finally {
    if (version === loadVersion) {
      reading = false;
      refreshButton();
    }
  }
});

$('node-list').addEventListener('input', () => {
  clearResults();
  if (loadError) message(loadError);
  else if (report?.warnings.length) message(`Simulation errors reported: ${report.warnings.join(' ')}`);
  refreshButton();
});

$('extract').addEventListener('click', () => {
  if (!report) {
    message(loadError || 'Choose a .rpt report file before extracting results.');
    $('report-file').focus();
    return;
  }
  results = selectNodes(report, $('node-list').value);
  if (!results.length) { message('Enter at least one node ID.'); return; }
  $('rows').replaceChildren();
  for (const result of results) {
    const row = document.createElement('tr');
    if (result.missing) row.className = 'missing';
    for (const [index, value] of [result.id, result.missing ? 'Not found' : result.type, result.peakFlow || '—', result.totalInflow || '—', result.peakTime || '—'].entries()) {
      const cell = document.createElement('td');
      if (index === 1) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = value;
        cell.append(badge);
      } else cell.textContent = value;
      row.append(cell);
    }
    $('rows').append(row);
  }
  const missing = results.filter(row => row.missing);
  const notices = [];
  if (report.warnings.length) notices.push(`Simulation errors reported: ${report.warnings.join(' ')}`);
  if (missing.length) notices.push(`${missing.length} node(s) not found: ${missing.map(row => row.id).join(', ')}. Check spelling and capitalization. Missing nodes will have blank values in the CSV.`);
  message(notices.join(' '));
  $('result-count').textContent = `${results.length - missing.length} of ${results.length} nodes found`;
  $('unit-info').textContent = report.volumeUnit === 'm³' ? 'Volumes converted to m³' : 'Original report units';
  $('peak-heading').textContent = `Peak flow (${report.flowUnit})`;
  $('volume-heading').textContent = `Total inflow (${report.volumeUnit})`;
  $('table-container').hidden = false;
  $('empty').hidden = true;
  $('export').disabled = results.length === missing.length;
});

$('export').addEventListener('click', () => {
  if (!report || !results.some(row => !row.missing)) return;
  const url = URL.createObjectURL(new Blob([toCsv(results, report)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename.replace(/\.rpt$/i, '')}_node_results.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('demo').addEventListener('click', () => {
  ++loadVersion;
  reading = false;
  loadError = '';
  clearResults();
  $('report-file').value = '';
  $('node-list').value = 'Junction-01\nStorage-02\nOutfall-03';
  loadText(`Synthetic demonstration report — not simulation results

  *******************
  Node Inflow Summary
  *******************

  -------------------------------------------------------------------------------------------------
                                  Maximum  Maximum                  Lateral       Total        Flow
                                  Lateral    Total  Time of Max      Inflow      Inflow     Balance
                                   Inflow   Inflow   Occurrence      Volume      Volume       Error
  Node                 Type           CMS      CMS  days hr:min    10^6 ltr    10^6 ltr     Percent
  -------------------------------------------------------------------------------------------------
  Junction-01          JUNCTION     0.120    1.840     0  01:35       0.420        12.6       0.012
  Storage-02           STORAGE      0.000    2.310     0  01:50       0.000        18.4       0.020
  Outfall-03           OUTFALL      0.000    3.760     0  02:10       0.000        29.1       0.001

`, 'sample-demo.rpt');
  $('extract').click();
  message('Sample data for demonstration only. Choose your own .rpt file to extract simulation results.');
});

$('startup-notice').hidden = true;
refreshButton();
