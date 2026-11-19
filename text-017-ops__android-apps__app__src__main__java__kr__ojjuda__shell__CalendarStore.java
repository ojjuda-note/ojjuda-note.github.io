package kr.ojjuda.shell;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import kr.ojjuda.icons.CalendarConfig;

/** Local fallback is packaged with every APK; the only network endpoint is fixed here. */
final class CalendarStore {
    static final String ENDPOINT = "https://ojjuda.kr/shared/app-icons/calendar.json";
    private static final long REFRESH_INTERVAL = 6 * 60 * 60 * 1000L;
    private static final String CACHE_NAME = "seasonal-icon-calendar-v1.json";
    private CalendarStore() {}

    static CalendarConfig load(Context context) {
        try (InputStream in = cache(context).openRead()) {
            return CalendarConfig.parse(read(in, Long.MAX_VALUE));
        } catch (Exception ignored) { /* First launch, incomplete cache, or invalid update. */ }
        int resource = context.getResources().getIdentifier("seasonal_icon_calendar", "raw", context.getPackageName());
        if (resource == 0) throw new IllegalStateException("Bundled icon calendar missing");
        try (InputStream in = context.getResources().openRawResource(resource)) {
            return CalendarConfig.parse(read(in, Long.MAX_VALUE));
        } catch (Exception error) { throw new IllegalStateException("Bundled calendar invalid", error); }
    }

    static synchronized boolean refreshIfDue(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("seasonal-icons", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis(), last = prefs.getLong("lastAttempt", 0);
        if (now >= last && now - last < REFRESH_INTERVAL) return false;
        prefs.edit().putLong("lastAttempt", now).apply();
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(ENDPOINT).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "OjjudaSeasonalIcons/1");
            if (connection.getResponseCode() != 200) return false;
            String mime = connection.getContentType();
            if (mime == null || !(mime.split(";", 2)[0].trim().equals("application/json"))) return false;
            if (connection.getContentLengthLong() > CalendarConfig.MAX_BYTES) return false;
            String body;
            try (InputStream in = connection.getInputStream()) {
                body = read(in, SystemClock.elapsedRealtime() + 10000);
            }
            CalendarConfig.parse(body); // Validate all structural data before replacing the last good cache.
            if (Thread.currentThread().isInterrupted()) return false;
            AtomicFile file = cache(context);
            FileOutputStream out = null;
            try {
                out = file.startWrite();
                out.write(body.getBytes(StandardCharsets.UTF_8));
                file.finishWrite(out);
            } catch (Exception error) {
                if (out != null) file.failWrite(out);
                return false;
            }
            return true;
        } catch (Exception ignored) {
            return false; // Offline mode retains a valid cache or the bundled calendar.
        } finally { if (connection != null) connection.disconnect(); }
    }

    private static AtomicFile cache(Context context) {
        return new AtomicFile(new File(context.getFilesDir(), CACHE_NAME));
    }
    private static String read(InputStream in, long deadline) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] block = new byte[4096];
        int count;
        while ((count = in.read(block)) != -1) {
            if (Thread.currentThread().isInterrupted() || SystemClock.elapsedRealtime() > deadline)
                throw new java.io.IOException("Read cancelled");
            if (bytes.size() + count > CalendarConfig.MAX_BYTES) throw new java.io.IOException("Calendar too large");
            bytes.write(block, 0, count);
        }
        return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
    }
}
