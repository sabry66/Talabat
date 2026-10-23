// PreToolUse: يمنع قراءة أو تعديل أو نسخ ملف توقيع الأندرويد وكلمة السر بتاعته وأي ملفات أسرار.
// المستودع عام: لو ملف التوقيع اتسرّب، أي حد يقدر يوقّع تحديث مزوّر لتطبيق أريفو.
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const t = input.tool_input || {};
  const text = [t.file_path, t.path, t.notebook_path, t.command, t.pattern].filter(Boolean).join('\n');
  const SECRET = /\.jks\b|\.keystore\b|[\\/]keystore[\\/]|keystore[-_]?pass|ks-pass|\bstorepass\b|serviceAccount.*\.json|\.env(\.|\b)/i;
  // build.sh بيستخدم ملف التوقيع جوه نفسه، وده مسموح
  const allowed = /^\s*(bash\s+)?(\.\/)?android\/build\.sh(\s|$)/;
  if (SECRET.test(text) && !allowed.test(t.command || '')) {
    process.stderr.write('⛔ ممنوع: الأمر ده بيلمس ملف التوقيع أو كلمة سر أو ملف أسرار. المستودع عام، فالملفات دي متتقريش ولا تتعدل ولا تترفع. لو محتاج تبني APK استخدم android/build.sh.\n');
    process.exit(2);
  }
  process.exit(0);
});
