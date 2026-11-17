package com.riftburn.game;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Full-screen WebView shell for RIFTBURN.
 *
 * The game is built from ES modules with root-relative URLs, which a file://
 * page cannot load. So the bundled files are served from a private https origin
 * instead: every request to HOST is answered straight out of the APK's assets and
 * never touches the network. (appassets.androidplatform.net is the domain Android
 * reserves for exactly this.) There is no game server behind that origin, so the
 * game runs on its offline profile, saved on the device.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null; // e.g. web fonts: use the network
                String path = uri.getPath();
                if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
                path = path.substring(1);
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-cache");
                try {
                    InputStream in = getAssets().open(path);
                    String mime = mime(path);
                    String encoding = mime.startsWith("text/") || mime.endsWith("json") ? "utf-8" : null;
                    return new WebResourceResponse(mime, encoding, 200, "OK", headers, in);
                } catch (IOException missing) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                            new ByteArrayInputStream(new byte[0]));
                }
            }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".m4a")) return "audio/mp4";
        return "application/octet-stream";
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    /** Back pauses the run or closes the open menu; on the title screen it backgrounds the app. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){return window.__rbBack?window.__rbBack():0})()",
                v -> { if (!"1".equals(v)) moveTaskToBack(true); });
    }
}
