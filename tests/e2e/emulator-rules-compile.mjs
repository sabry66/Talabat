// يرفع القواعد للـ Emulator ويطبع أخطاء الـ compile بالتفصيل
import { readFileSync } from 'node:fs';
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const r = await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-talabaty:securityRules', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
const body = await r.text();
if (r.status !== 200) { console.log('❌ قواعد Firestore فيها خطأ:\n' + (JSON.parse(body).error?.message || body)); process.exit(1); }
console.log('✔ القواعد بتتعمل compile من غير أخطاء');
