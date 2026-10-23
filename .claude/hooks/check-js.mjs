// PostToolUse: بعد أي تعديل في ملف JavaScript، يتأكد إن الملف مفيهوش خطأ في الكتابة (node --check).
// خطأ واحد في ملف زي app.js بيوقّع الموقع كله.
import { execFileSync } from 'node:child_process';
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const file = input.tool_input?.file_path || '';
  if (!/\.(m?js)$/.test(file) || /node_modules/.test(file)) process.exit(0);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    process.stderr.write(`❌ ${file} فيه خطأ في الكتابة (node --check):\n${String(e.stderr || e.message).slice(0, 1500)}\nصلّحه قبل ما تكمل.\n`);
    process.exit(2);
  }
  process.exit(0);
});
