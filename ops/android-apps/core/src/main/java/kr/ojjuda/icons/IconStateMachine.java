package kr.ojjuda.icons;

/** Enables a replacement before disabling any old launcher on pre-33 Android. */
public final class IconStateMachine {
    public interface Backend {
        boolean enabled(String theme);
        void enable(String theme);
        void disable(String theme);
        boolean supportsAtomic();
        void replaceAtomically(String theme);
    }
    private IconStateMachine() {}
    public static synchronized void select(Backend backend, String chosen) {
        if (!Theme.isAllowed(chosen)) throw new IllegalArgumentException("Unknown compiled icon");
        boolean correct = backend.enabled(chosen);
        for (String theme : Theme.ALL) if (!theme.equals(chosen) && backend.enabled(theme)) correct = false;
        if (correct) return;
        if (backend.supportsAtomic()) {
            try {
                backend.replaceAtomically(chosen);
                if (backend.enabled(chosen)) return;
            } catch (RuntimeException ignored) { /* Safe enable-first fallback below. */ }
        }
        // If this fails, no old component has been disabled.
        backend.enable(chosen);
        if (!backend.enabled(chosen)) throw new IllegalStateException("Replacement launcher not enabled");
        for (String theme : Theme.ALL) {
            if (!theme.equals(chosen) && backend.enabled(theme)) {
                try { backend.disable(theme); }
                catch (RuntimeException ignored) { /* A duplicate is safer than losing every entry. */ }
            }
        }
    }
}
