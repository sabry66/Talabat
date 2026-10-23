#!/usr/bin/env bash
# تشغيل اختبارات أريفو.
#   bash tests/run.sh          → demo + rules (الافتراضي، قبل كل firebase deploy)
#   bash tests/run.sh demo     → الوضع التجريبي بس (سريع، من غير Firebase)
#   bash tests/run.sh rules    → قواعد الحماية واللوحات على محاكي Firebase
#   bash tests/run.sh full     → الكل + الدوس على كل زرار (بياخد وقت)
#   bash tests/run.sh live     → فحص قراءة بس للموقع الحقيقي (مفيش كتابة)
# أول مرة: (cd tests && npm install && npx playwright install chromium)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
MODE="${1:-default}"
mkdir -p "$HERE/out/live"
FAILED=0

run() { # اسم الاختبار، الأمر
  echo; echo "▶ $1"
  local log="$HERE/out/$1.log"
  if "${@:2}" >"$log" 2>&1 && ! grep -qE "STUCK|STOPPED|ALLOWED ❌|❌ OLD|overflow=[1-9]|pageerror|^❌|^✘|^FAILED" "$log" \
     && ! grep -qE "errors?:? \[[^]]" "$log"; then
    echo "  ✅ نجح"
  else
    echo "  ❌ فشل — التفاصيل: tests/out/$1.log"; tail -15 "$log" | sed 's/^/    /'; FAILED=1
  fi
}

# سيرفر محلي للملفات (public/) على 8765
python3 -m http.server 8765 --directory "$ROOT/public" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

if [[ "$MODE" == default || "$MODE" == demo || "$MODE" == full ]]; then
  for t in demo-responsive-roles demo-mobile-tabs demo-item-options demo-order-problem demo-order-review demo-reviews demo-favorites demo-addresses demo-payments demo-no-hidden-fees demo-driver-change demo-offers-map demo-coupons-ui demo-join demo-terms-consent demo-admin-user-search; do
    run "$t" node "$HERE/e2e/$t.mjs"
  done
fi
if [[ "$MODE" == full ]]; then
  run demo-click-every-button-390 node "$HERE/e2e/demo-click-every-button.mjs" 390
fi
if [[ "$MODE" == default || "$MODE" == rules || "$MODE" == full ]]; then
  for t in emulator-rules-coupons-drivers-terms emulator-admin-tabs-load emulator-slow-network-forms; do
    run "$t" bash -c "cd '$ROOT' && npx --prefix '$HERE' firebase emulators:exec --only auth,firestore --project demo-talabaty 'node $HERE/e2e/$t.mjs'"
  done
fi
if [[ "$MODE" == live ]]; then
  run live-readonly-check node "$HERE/e2e/live-readonly-check.mjs"
fi

echo
if [[ $FAILED == 0 ]]; then echo "✅ كل الاختبارات نجحت"; else echo "❌ فيه اختبارات فشلت"; fi
exit $FAILED
