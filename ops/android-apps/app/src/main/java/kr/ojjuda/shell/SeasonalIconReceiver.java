package kr.ojjuda.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class SeasonalIconReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !Intent.ACTION_DATE_CHANGED.equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action)
            && !Intent.ACTION_TIMEZONE_CHANGED.equals(action)) return;
        SeasonalIconController.applyLocal(context);
        SeasonalIconScheduler.schedule(context, Intent.ACTION_TIME_CHANGED.equals(action));
    }
}
