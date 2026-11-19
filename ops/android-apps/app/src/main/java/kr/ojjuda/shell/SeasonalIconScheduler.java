package kr.ojjuda.shell;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.os.PersistableBundle;
import android.os.SystemClock;
import java.time.Instant;
import java.time.ZonedDateTime;
import kr.ojjuda.icons.CalendarConfig;
import kr.ojjuda.icons.ClockPolicy;

public final class SeasonalIconScheduler {
    static final int PERIODIC = 4810;
    static final int MIDNIGHT_EVEN = 4811, MIDNIGHT_ODD = 4812;
    private SeasonalIconScheduler() {}
    public static void schedule(Context context) {
        schedule(context, false);
    }
    public static void schedule(Context context, boolean clockWasSet) {
        try { scheduleSafely(context, clockWasSet); }
        catch (RuntimeException ignored) {
            android.util.Log.w("OjjudaIcons", "Background scheduling deferred; launch-time updates remain available");
        }
    }
    private static void scheduleSafely(Context context, boolean clockWasSet) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        ComponentName service = new ComponentName(context, SeasonalIconJobService.class);
        if (scheduler.getPendingJob(PERIODIC) == null) {
            scheduler.schedule(new JobInfo.Builder(PERIODIC, service)
                .setPeriodic(6 * 60 * 60 * 1000L, 60 * 60 * 1000L).setPersisted(true).build());
        }
        long now = System.currentTimeMillis();
        long elapsed = SystemClock.elapsedRealtime();
        ZonedDateTime next = Instant.ofEpochMilli(now).atZone(CalendarConfig.SEOUL).toLocalDate()
            .plusDays(1).atStartOfDay(CalendarConfig.SEOUL);
        long boundary = next.toInstant().toEpochMilli();
        int id = (next.toLocalDate().toEpochDay() & 1) == 0 ? MIDNIGHT_EVEN : MIDNIGHT_ODD;
        JobInfo pending = scheduler.getPendingJob(id);
        if (pending != null && pending.getExtras().getLong("kstBoundary", 0) == boundary) {
            PersistableBundle saved = pending.getExtras();
            boolean timebaseChanged = ClockPolicy.changed(now, elapsed,
                saved.getLong("scheduledWall", 0), saved.getLong("scheduledElapsed", -1));
            if (!clockWasSet && !timebaseChanged) return;
        }
        PersistableBundle extras = new PersistableBundle();
        extras.putLong("kstBoundary", boundary);
        extras.putLong("scheduledWall", now);
        extras.putLong("scheduledElapsed", elapsed);
        long delay = Math.max(1000, boundary - now);
        scheduler.schedule(new JobInfo.Builder(id, service).setExtras(extras)
            .setMinimumLatency(delay).setOverrideDeadline(delay + 2 * 60 * 60 * 1000L)
            .setPersisted(true).build());
    }
}
