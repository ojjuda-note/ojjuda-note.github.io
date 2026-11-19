package kr.ojjuda.shell;

import android.app.Application;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

public class SeasonalApplication extends Application {
    private SeasonalIconReceiver dateReceiver;
    @Override public void onCreate() {
        super.onCreate();
        dateReceiver = new SeasonalIconReceiver();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_DATE_CHANGED);
        filter.addAction(Intent.ACTION_TIME_CHANGED);
        filter.addAction(Intent.ACTION_TIMEZONE_CHANGED);
        try {
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(dateReceiver, filter, RECEIVER_NOT_EXPORTED);
            else registerReceiver(dateReceiver, filter);
        } catch (RuntimeException ignored) {
            // Icon refresh must never prevent the actual TWA activity from opening.
        }
        SeasonalIconController.applyLocal(this);
        SeasonalIconScheduler.schedule(this);
    }
}
