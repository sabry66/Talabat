#!/usr/bin/env bash
# بيبني ملفات APK لتطبيقات أريفو التلاتة (العملاء، المطاعم، المندوبين) من نفس الكود.
# المتطلبات (Ubuntu/Debian):
#   sudo apt install openjdk-17-jdk aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange
# مفتاح التوقيع (keystore): لازم يفضل هو هو عشان التحديثات تتسطب فوق النسخة القديمة.
#   ARRIVO_KEYSTORE=مسار الملف  ARRIVO_KEYSTORE_PASS=كلمة السر  ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

SDK=/usr/lib/android-sdk
ANDROID_JAR="$SDK/platforms/android-23/android.jar"
TOOLS="$SDK/build-tools/debian"
SITE="https://arrivo-932e4.web.app"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
KEYSTORE="${ARRIVO_KEYSTORE:-keystore/arrivo.jks}"
PASS="${ARRIVO_KEYSTORE_PASS:?حط كلمة سر مفتاح التوقيع في ARRIVO_KEYSTORE_PASS}"
OUT=dist
BUILD=build

if [ ! -f "$KEYSTORE" ]; then
  echo "عمل مفتاح توقيع جديد: $KEYSTORE (احتفظ بيه في مكان آمن!)"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$PASS" -keypass "$PASS" -alias arrivo \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Arrivo, O=Arrivo, C=EG"
fi

rm -rf "$BUILD" "$OUT"
mkdir -p "$BUILD/classes" "$OUT"

# 1) نترجم الكود مرة واحدة للتلات تطبيقات
javac --release 8 -nowarn -classpath "$ANDROID_JAR" -d "$BUILD/classes" $(find src -name '*.java')
java -jar "$TOOLS/lib/dx.jar" --dex --min-sdk-version=23 --output="$BUILD/classes.dex" "$BUILD/classes"

# اسم الملف | الباكدج | اسم التطبيق | الصفحة | الشاشة متقفلش | الأيقونة
build_app() {
  local file=$1 pkg=$2 label=$3 path=$4 keep=$5 icon=$6
  local dir="$BUILD/$file"
  mkdir -p "$dir/res/values"
  for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    mkdir -p "$dir/res/mipmap-${d%%:*}"
    python3 - "../public/img/$icon-512.png" "$dir/res/mipmap-${d%%:*}/ic_launcher.png" "${d##*:}" <<'PY'
import sys
from PIL import Image
Image.open(sys.argv[1]).resize((int(sys.argv[3]),) * 2, Image.LANCZOS).save(sys.argv[2], optimize=True)
PY
  done
  cat > "$dir/res/values/strings.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources><string name="app_name">$label</string></resources>
XML
  cat > "$dir/AndroidManifest.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="$pkg" android:versionCode="$VERSION_CODE" android:versionName="$VERSION_NAME">
  <uses-sdk android:minSdkVersion="23" android:targetSdkVersion="34" />
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <application android:label="@string/app_name" android:icon="@mipmap/ic_launcher"
      android:supportsRtl="true" android:usesCleartextTraffic="false"
      android:theme="@android:style/Theme.Material.Light.NoActionBar">
    <activity android:name="com.arrivo.shell.MainActivity" android:exported="true"
        android:configChanges="orientation|screenSize|keyboardHidden|screenLayout"
        android:windowSoftInputMode="adjustResize">
      <meta-data android:name="startUrl" android:value="$SITE$path" />
      <meta-data android:name="keepScreenOn" android:value="$keep" />
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
XML
  "$TOOLS/aapt" package -f -M "$dir/AndroidManifest.xml" -S "$dir/res" -I "$ANDROID_JAR" -F "$dir/unsigned.apk"
  (cd "$BUILD" && cp classes.dex "$file/" && cd "$file" && "$TOOLS/aapt" add unsigned.apk classes.dex >/dev/null)
  "$TOOLS/zipalign" -f 4 "$dir/unsigned.apk" "$dir/aligned.apk"
  "$TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
    --out "$OUT/$file.apk" "$dir/aligned.apk"
  "$TOOLS/apksigner" verify "$OUT/$file.apk"
  echo "✅ $OUT/$file.apk"
}

build_app Arrivo           com.arrivo.app        "أريفو"         "/"                 false icon
build_app Arrivo-Restaurant com.arrivo.restaurant "أريفو مطاعم"   "/restaurant.html"  true  icon-restaurant
build_app Arrivo-Driver    com.arrivo.driver     "أريفو مندوب"   "/delivery.html"    true  icon-driver
