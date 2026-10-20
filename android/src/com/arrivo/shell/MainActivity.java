package com.arrivo.shell;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * تطبيق أريفو: بيفتح الموقع جوه WebView بملء الشاشة.
 * رابط البداية وإبقاء الشاشة منورة بيتحددوا من meta-data في AndroidManifest.xml
 * (عشان نفس الكود يطلع منه تطبيق العملاء والمطاعم والمندوبين).
 */
public class MainActivity extends Activity {
    private static final int FILE_REQUEST = 1;
    private static final int LOCATION_REQUEST = 2;

    private WebView web;
    private String host;
    private String startUrl;
    private ValueCallback<Uri[]> fileCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Bundle meta = readMeta();
        startUrl = meta.getString("startUrl", "https://arrivo-932e4.web.app/");
        host = Uri.parse(startUrl).getHost();
        if (meta.getBoolean("keepScreenOn", false)) {
            // المطعم والمندوب: الشاشة متقفلش عشان تنبيه الطلبات يفضل شغال
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
        if (Build.VERSION.SDK_INT >= 21) getWindow().setStatusBarColor(Color.parseColor("#2d245b"));

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // صوت تنبيه الطلبات
        s.setUserAgentString(s.getUserAgentString() + " ArrivoApp");

        web.setWebViewClient(new WebViewClient() {
            // بتتنادى في كل نسخ أندرويد (النسخ الجديدة بتحولها للنسخة دي تلقائيًا)
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openOutside(Uri.parse(url));
            }

            // النسخة القديمة من onReceivedError بتتنادى لأخطاء الصفحة الرئيسية بس
            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String description, String url) {
                showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCallback = callback;
                    requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION }, LOCATION_REQUEST);
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }

            // رفع صور اللوجو والأصناف
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(startUrl);
    }

    private Bundle readMeta() {
        try {
            ActivityInfo info = getPackageManager().getActivityInfo(getComponentName(), PackageManager.GET_META_DATA);
            return info.metaData != null ? info.metaData : new Bundle();
        } catch (PackageManager.NameNotFoundException e) {
            return new Bundle();
        }
    }

    // صفحات الموقع جوه التطبيق؛ التليفون والخرائط وأي لينك تاني بيفتح في التطبيق المناسب
    private boolean openOutside(Uri uri) {
        String scheme = uri.getScheme();
        if (("https".equals(scheme) || "http".equals(scheme)) && host != null && host.equals(uri.getHost())) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // مفيش تطبيق يفتح اللينك ده
        }
        return true;
    }

    private void showOffline() {
        String html = "<html dir='rtl'><body style='font-family:sans-serif;text-align:center;padding:60px 20px;color:#2d245b'>"
                + "<div style='font-size:60px'>📡</div><h2>مفيش اتصال بالإنترنت</h2>"
                + "<p>اتأكد من النت وجرّب تاني</p>"
                + "<button onclick=\"location.href='" + startUrl + "'\" style='font-size:18px;padding:12px 28px;border:0;"
                + "border-radius:12px;background:#2d245b;color:#fff'>حاول تاني</button></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private boolean hasLocationPermission() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (code == LOCATION_REQUEST && geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocationPermission(), false);
            geoCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
