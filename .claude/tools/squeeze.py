#!/usr/bin/env python3
"""squeeze: يضغط مخرجات الأوامر الطويلة (لوجات، JSON، نتايج بحث) قبل ما Claude يقراها.

الفكرة زي Headroom بس آمنة: محلي بالكامل، مكتبات Python العادية بس، ومفيش أي اتصال بالنت.
والأصل الكامل بيتحفظ في ملف (عشان لو محتاج تفصيلة اتشالت يرجعلها) — مفيش حاجة بتضيع.

الاستخدام:
    أمر-طويل 2>&1 | python3 .claude/tools/squeeze.py            # الافتراضي: 120 سطر
    أمر-طويل 2>&1 | python3 .claude/tools/squeeze.py --max 60
    python3 .claude/tools/squeeze.py --file tests/out/x.log

بيعمل إيه:
  1. السطور المهمة (خطأ، فشل، ❌، ✘، Error، Traceback، permission، STOPPED...) بتفضل زي ما هي دايمًا.
  2. السطور المتكررة أو المتشابهة (نفس السطر بأرقام/أوقات مختلفة) بتتجمع في سطر واحد "×N".
  3. JSON طويل: اللستات الطويلة بتتختصر لأول عنصرين + عددهم.
  4. السطور الطويلة جدًا بتتقص من النص.
  5. لو لسه طويل: أول الكلام وآخره + كل السطور المهمة اللي في النص.
"""
import argparse, hashlib, json, os, re, sys, time

IMPORTANT = re.compile(
    r"error|fail|exception|traceback|denied|❌|✘|stopped|stuck|warn|allowed ❌|fatal|panic|assert|"
    r"خطأ|فشل|ممنوع|⛔|undefined|cannot|unexpected|timeout|refused|not found|missing",
    re.I)
VOLATILE = re.compile(r"\d+|0x[0-9a-f]+|[0-9a-f]{8,}|\b\d{1,2}:\d{2}(:\d{2})?\b", re.I)
MAX_LINE = 400


def shape(line):
    """شكل السطر من غير الأرقام والأوقات، عشان نعرف السطور المتشابهة."""
    return VOLATILE.sub("#", line.strip())[:200]


def squeeze_json(text, keep=2):
    try:
        data = json.loads(text)
    except Exception:
        return None

    def walk(x):
        if isinstance(x, list):
            if len(x) > keep + 1:
                return [walk(v) for v in x[:keep]] + [f"... و{len(x) - keep} عنصر كمان (نفس الشكل)"]
            return [walk(v) for v in x]
        if isinstance(x, dict):
            return {k: walk(v) for k, v in x.items()}
        if isinstance(x, str) and len(x) > 300:
            return x[:200] + f"... (+{len(x) - 200} حرف)"
        return x

    return json.dumps(walk(data), ensure_ascii=False, indent=1)


def squeeze_lines(lines, max_lines):
    # 1+2: نجمع المتكرر (ورا بعض أو متفرق) ونحافظ على المهم
    out, counts, first_idx = [], {}, {}
    for line in lines:
        line = line.rstrip("\n")
        if len(line) > MAX_LINE:
            line = line[:300] + f" … (+{len(line) - 300} حرف)"
        key = shape(line)
        if key in counts and not IMPORTANT.search(line):
            counts[key] += 1
            continue
        if key in counts:  # سطر مهم متكرر: نعدّه برضه بس نسيب أول واحد بس
            counts[key] += 1
            continue
        counts[key] = 1
        first_idx[key] = len(out)
        out.append([line, key])
    lines2 = [(l + (f"   ×{counts[k]}" if counts[k] > 1 else "")) for l, k in out]
    if len(lines2) <= max_lines:
        return lines2, 0
    # 5: أول وآخر + المهم في النص
    head, tail = lines2[: max_lines // 3], lines2[-max_lines // 3:]
    middle = lines2[max_lines // 3: -max_lines // 3]
    imp = [l for l in middle if IMPORTANT.search(l)][: max_lines // 3]
    dropped = len(middle) - len(imp)
    return head + [f"… اتشال {dropped} سطر عادي من النص (الأصل كامل في الملف) …"] + imp + tail, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--max", type=int, default=120)
    ap.add_argument("--save-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tests", "out", "squeeze"))
    a = ap.parse_args()
    raw = open(a.file, encoding="utf-8", errors="replace").read() if a.file else sys.stdin.read()
    if not raw.strip():
        return
    # نحفظ الأصل (قابل للرجوع)
    os.makedirs(a.save_dir, exist_ok=True)
    name = time.strftime("%H%M%S") + "-" + hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()[:8] + ".txt"
    path = os.path.normpath(os.path.join(a.save_dir, name))
    with open(path, "w", encoding="utf-8") as f:
        f.write(raw)

    js = squeeze_json(raw.strip())
    if js is not None:
        result = js.splitlines()
        result, _ = squeeze_lines(result, a.max)
    else:
        result, _ = squeeze_lines(raw.splitlines(), a.max)
    text = "\n".join(result)
    before, after = len(raw), len(text)
    print(text)
    if after < before:
        print(f"\n[squeeze] {before:,} → {after:,} حرف (وفّر {100 - after * 100 // max(before, 1)}%). الأصل كامل: {path}")


if __name__ == "__main__":
    main()
