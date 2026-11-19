package kr.ojjuda.icons;

import org.junit.Test;
import java.util.HashSet;
import java.util.Set;
import static org.junit.Assert.*;

public class IconStateMachineTest {
    static class Fake implements IconStateMachine.Backend {
        Set<String> active = new HashSet<>();
        boolean atomic, failEnable, failDisable, failAtomic;
        int atomicCalls, calls;
        Fake(boolean atomic) { this.atomic = atomic; active.add("summer"); }
        public boolean enabled(String theme) { return active.contains(theme); }
        public void enable(String theme) {
            calls++;
            if (failEnable) throw new IllegalStateException("Enable failed");
            active.add(theme); assertFalse(active.isEmpty());
        }
        public void disable(String theme) {
            calls++;
            if (failDisable) throw new IllegalStateException("Disable failed");
            active.remove(theme); assertFalse("No launcher may disappear between calls", active.isEmpty());
        }
        public boolean supportsAtomic() { return atomic; }
        public void replaceAtomically(String theme) {
            atomicCalls++;
            if (failAtomic) throw new IllegalStateException("Atomic call failed");
            active.clear(); active.add(theme);
        }
    }
    @Test public void pre33EnablesFirst() {
        Fake backend = new Fake(false);
        IconStateMachine.select(backend, "christmas");
        assertEquals(1, backend.active.size()); assertTrue(backend.enabled("christmas"));
    }
    @Test public void api33UsesOneAtomicBatch() {
        Fake backend = new Fake(true);
        IconStateMachine.select(backend, "autumn");
        assertEquals(1, backend.atomicCalls); assertEquals(0, backend.calls);
        assertTrue(backend.enabled("autumn")); assertFalse(backend.enabled("summer"));
    }
    @Test public void failedNewEnablePreservesOldEntry() {
        Fake backend = new Fake(false); backend.failEnable = true;
        try { IconStateMachine.select(backend, "spring"); fail(); } catch (IllegalStateException expected) { }
        assertTrue(backend.enabled("summer")); assertEquals(1, backend.active.size());
    }
    @Test public void failedAtomicCallFallsBackToEnableFirst() {
        Fake backend = new Fake(true); backend.failAtomic = true;
        IconStateMachine.select(backend, "spring");
        assertTrue(backend.enabled("spring")); assertEquals(1, backend.active.size());
    }
    @Test public void failedDisableCanLeaveDuplicateButNeverNoLauncher() {
        Fake backend = new Fake(false); backend.failDisable = true;
        IconStateMachine.select(backend, "winter");
        assertTrue(backend.enabled("winter")); assertTrue(backend.enabled("summer"));
    }
    @Test public void unchangedDayDoesNotMutateComponents() {
        Fake backend = new Fake(true); IconStateMachine.select(backend, "summer");
        assertEquals(0, backend.calls); assertEquals(0, backend.atomicCalls);
    }
    @Test public void remotelyInventedThemeIsRejected() {
        Fake backend = new Fake(false);
        try { IconStateMachine.select(backend, "downloaded-code"); fail(); } catch (IllegalArgumentException expected) { }
        assertEquals(0, backend.calls); assertTrue(backend.enabled("summer"));
    }
}
