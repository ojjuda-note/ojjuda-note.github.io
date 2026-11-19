package kr.ojjuda.icons;

/** Detect a changed wall-clock timebase without resetting a healthy relative-delay job. */
public final class ClockPolicy {
    private ClockPolicy() {}
    public static boolean changed(long nowWall, long nowElapsed, long scheduledWall, long scheduledElapsed) {
        if (scheduledWall <= 0 || scheduledElapsed < 0 || nowElapsed < scheduledElapsed) return true;
        long clockAdvance = nowWall - scheduledWall;
        long actualElapsed = nowElapsed - scheduledElapsed;
        return Math.abs(clockAdvance - actualElapsed) > 60_000;
    }
}
