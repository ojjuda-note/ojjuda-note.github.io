package kr.ojjuda.icons;

import org.junit.Test;
import static org.junit.Assert.*;

public class ClockPolicyTest {
    @Test public void manualClockAdvanceMustRecomputeMidnightDelay() {
        long wall = 1_800_000_000_000L, elapsed = 50_000L;
        // A four-hour midnight job scheduled at 20:00 must not stay four hours away after setting 23:00.
        assertTrue(ClockPolicy.changed(wall + 3 * 3_600_000L, elapsed, wall, elapsed));
    }
    @Test public void elapsedTimeAloneDoesNotResetTheJob() {
        long wall = 1_800_000_000_000L, elapsed = 50_000L, hour = 3_600_000L;
        assertFalse(ClockPolicy.changed(wall + hour, elapsed + hour, wall, elapsed));
    }
    @Test public void rebootAndOldJobFormatRequireRescheduling() {
        assertTrue(ClockPolicy.changed(1_800_000_001_000L, 200L, 1_800_000_000_000L, 900_000L));
        assertTrue(ClockPolicy.changed(1_800_000_001_000L, 200L, 0, -1));
    }
}
