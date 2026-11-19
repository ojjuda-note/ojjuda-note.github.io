package kr.ojjuda.shell;

import android.os.Bundle;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The actual TWA activity stays enabled; only MAIN/LAUNCHER aliases are switched. */
public class SeasonalLauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final ExecutorService REFRESH = Executors.newSingleThreadExecutor();
    @Override protected void onCreate(Bundle state) {
        SeasonalIconController.applyLocal(getApplicationContext());
        SeasonalIconScheduler.schedule(getApplicationContext());
        super.onCreate(state);
        android.content.Context app = getApplicationContext();
        REFRESH.submit(() -> {
            if (CalendarStore.refreshIfDue(app)) SeasonalIconController.applyLocal(app);
        });
    }
}
