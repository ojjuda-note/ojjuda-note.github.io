package kr.ojjuda.shell;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SeasonalIconJobService extends JobService {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<Integer, Work> running = new ConcurrentHashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());
    @Override public boolean onStartJob(JobParameters params) {
        Work work = new Work();
        running.put(params.getJobId(), work);
        work.future = worker.submit(() -> {
            SeasonalIconController.applyLocal(this); // Runs even without internet.
            CalendarStore.refreshIfDue(this);
            if (!work.cancelled.get()) SeasonalIconController.applyLocal(this);
            main.post(() -> {
                if (work.cancelled.get()) return;
                running.remove(params.getJobId(), work);
                jobFinished(params, false);
                SeasonalIconScheduler.schedule(this);
            });
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) {
        Work work = running.remove(params.getJobId());
        if (work != null) {
            work.cancelled.set(true);
            if (work.future != null) work.future.cancel(true);
        }
        return true;
    }
    @Override public void onDestroy() {
        for (Work work : running.values()) work.cancelled.set(true);
        worker.shutdownNow();
        super.onDestroy();
    }
    private static final class Work {
        final AtomicBoolean cancelled = new AtomicBoolean();
        volatile Future<?> future;
    }
}
