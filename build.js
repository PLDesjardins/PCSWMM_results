import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const [html, css, parser, app] = await Promise.all(['index.html', 'styles.css', 'parser.js', 'app.js'].map(read));
const script = parser.replace(/^export /gm, '') + '\n' + app.replace(/^import .*;\n/m, '');
const standalone = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', '')
  .replace('</body>', () => `<script>\n${script.replaceAll('</script', '<\\/script')}\n</script>\n</body>`);
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/PCSWMM-results.html', root), standalone);
console.log('Created dist/PCSWMM-results.html — open directly in a browser.');
