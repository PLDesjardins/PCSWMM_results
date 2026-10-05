import { parseReport, labelModels, selectBatch, batchToCsv } from './parser.js';

const $ = id => document.getElementById(id);
let models = [];
let results = [];
let loadVersion = 0;
let reading = false;

function message(text = '') {
  $('message').textContent = text;
  $('message').hidden = !text;
}

function clearResults() {
  results = [];
  $('rows').replaceChildren();
  $('table-head').replaceChildren();
  $('export').disabled = true;
  $('table-container').hidden = true;
  $('empty').hidden = false;
  message();
}

function reportNotices() {
  return models.flatMap(model => model.error ? [`${model.label}: ${model.error}`]
    : model.report.warnings.map(warning => `${model.label}: ${warning}`));
}

function refreshButton() {
  $('extract').disabled = reading;
  const count = models.filter(model => model.report).length;
  $('extract-help').textContent = reading ? 'Reading your reports…'
    : !models.length ? 'Choose reports, then enter your node IDs.'
    : !count ? 'No readable reports. See the file errors above.'
    : !$('node-list').value.trim() ? `${count} report(s) loaded. Enter at least one node ID.`
    : `Ready to extract from ${count} report(s).`;
}

function showFiles() {
  $('file-list').replaceChildren();
  $('file-label').textContent = models.length ? `${models.length} report(s) selected` : 'Choose .rpt files';
  const count = models.filter(model => model.report).length;
  $('file-info').textContent = models.length ? `${count} of ${models.length} reports loaded. Select again to replace this batch.` : 'Your files are read locally in this browser.';
  for (const model of models) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = model.label;
    const info = document.createElement('span');
    info.textContent = model.error ? `Report error: ${model.error}` : `${model.report.nodes.size} nodes · ${model.report.flowUnit} · ${model.report.volumeUnit}`;
    if (model.error) item.className = 'file-error';
    item.append(name, info);
    $('file-list').append(item);
  }
  refreshButton();
}

$('report-file').addEventListener('change', async event => {
  const version = ++loadVersion;
  clearResults();
  models = [];
  const files = Array.from(event.target.files);
  reading = files.length > 0;
  showFiles();
  const loaded = [];
  // Read sequentially to avoid holding all file buffers in memory at once.
  for (const [index, file] of files.entries()) {
    if (version !== loadVersion) return;
    $('file-label').textContent = `${files.length} report(s) selected`;
    $('file-info').textContent = `Reading ${index + 1} of ${files.length}: ${file.name}`;
    try {
      if (!/\.rpt$/i.test(file.name)) throw new Error('Please choose a .rpt report file.');
      if (file.size > 100 * 1024 * 1024) throw new Error('This report exceeds the 100 MB limit. Use a report with summary results only.');
      const bytes = await file.arrayBuffer();
      if (version !== loadVersion) return;
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { text = new TextDecoder('windows-1252').decode(bytes); }
      loaded.push({ name: file.name, report: parseReport(text) });
    } catch (error) {
      if (version !== loadVersion) return;
      loaded.push({ name: file.name, error: error.message });
    }
  }
  if (version !== loadVersion) return;
  models = labelModels(loaded);
  reading = false;
  showFiles();
  message(reportNotices().join(' '));
});

$('node-list').addEventListener('input', () => {
  clearResults();
  message(reportNotices().join(' '));
  refreshButton();
});

function heading(text, row, scope, span = 1) {
  const cell = document.createElement('th');
  cell.textContent = text;
  cell.scope = scope;
  if (scope === 'colgroup') cell.colSpan = span;
  row.append(cell);
  return cell;
}

$('extract').addEventListener('click', () => {
  if (!models.some(model => model.report)) {
    message(reportNotices().join(' ') || 'Choose .rpt report files before extracting results.');
    $('report-file').focus();
    return;
  }
  results = selectBatch(models, $('node-list').value);
  if (!results.length) { message('Enter at least one node ID.'); return; }
  $('rows').replaceChildren();
  $('table-head').replaceChildren();
  const groups = document.createElement('tr');
  const columns = document.createElement('tr');
  heading('Node ID', groups, 'col').rowSpan = 2;
  for (const model of models) {
    heading(model.label, groups, 'colgroup', 4);
    for (const title of ['Type / status', `Peak flow${model.report ? ` (${model.report.flowUnit})` : ''}`, `Total inflow${model.report ? ` (${model.report.volumeUnit})` : ''}`, 'Peak time']) {
      heading(title, columns, 'col');
    }
  }
  $('table-head').append(groups, columns);
  for (const result of results) {
    const row = document.createElement('tr');
    const id = document.createElement('th');
    id.scope = 'row';
    id.textContent = result.id;
    row.append(id);
    for (const value of result.models) {
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge${value.error || value.missing ? ' missing' : ''}`;
      badge.textContent = value.error ? 'Report error' : value.missing ? 'Not found' : value.type;
      status.append(badge);
      row.append(status);
      for (const [index, text] of [value.peakFlow, value.totalInflow, value.peakTime].entries()) {
        const cell = document.createElement('td');
        cell.textContent = text || '—';
        if (index < 2) cell.className = 'numeric';
        row.append(cell);
      }
    }
    $('rows').append(row);
  }
  const notices = reportNotices();
  let found = 0;
  models.forEach((model, index) => {
    if (!model.report) return;
    const missing = results.filter(row => row.models[index].missing).map(row => row.id);
    found += results.length - missing.length;
    if (missing.length) notices.push(`${model.label} — not found: ${missing.join(', ')}.`);
  });
  if (notices.length) notices.push('Missing nodes and unreadable reports export blank values with their status.');
  message(notices.join(' '));
  $('result-count').textContent = `${results.length} nodes · ${models.length} reports · ${found} results found`;
  $('unit-info').textContent = 'Liter volumes in m³ · Flow units shown per report';
  $('table-container').hidden = false;
  $('empty').hidden = true;
  $('export').disabled = found === 0;
});

$('export').addEventListener('click', () => {
  if (!results.some(row => row.models.some(value => !value.error && !value.missing))) return;
  const url = URL.createObjectURL(new Blob([batchToCsv(results, models)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = models.length === 1 ? `${models[0].name.replace(/\.rpt$/i, '')}_node_results.csv` : 'batch_node_results.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('demo').addEventListener('click', () => {
  ++loadVersion;
  reading = false;
  clearResults();
  $('report-file').value = '';
  $('node-list').value = 'Junction-01\nStorage-02\nOutfall-03';
  const sample = `Synthetic demonstration report — not simulation results
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

`;
  models = labelModels([
    { name: 'existing-model.rpt', report: parseReport(sample) },
    { name: 'proposed-model.rpt', report: parseReport(sample.replace('1.840', '1.420').replace('12.6', '10.2').replace('2.310', '1.980')) }
  ]);
  showFiles();
  $('extract').click();
  message('Sample data for demonstration only. Choose your own .rpt files to extract simulation results.');
});

$('startup-notice').hidden = true;
refreshButton();
