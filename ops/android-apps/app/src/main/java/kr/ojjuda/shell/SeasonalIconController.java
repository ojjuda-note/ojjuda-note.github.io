package kr.ojjuda.shell;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import kr.ojjuda.icons.IconStateMachine;
import kr.ojjuda.icons.Theme;

public final class SeasonalIconController {
    private SeasonalIconController() {}
    public static synchronized void applyLocal(Context context) {
        PackageBackend backend = new PackageBackend(context);
        try {
            String desired = CalendarStore.load(context).select(System.currentTimeMillis());
            IconStateMachine.select(backend, desired);
        } catch (RuntimeException error) {
            // Leave the old icon available. Repair a missing launcher if another tool disabled all aliases.
            boolean any = false;
            for (String theme : Theme.ALL) {
                try { any |= backend.enabled(theme); } catch (RuntimeException ignored) { }
            }
            if (!any) {
                try { backend.enable(Theme.DEFAULT); } catch (RuntimeException ignored) { }
            }
            Log.w("OjjudaIcons", "Icon update deferred; existing launcher preserved");
        }
    }
    static final class PackageBackend implements IconStateMachine.Backend {
        private final PackageManager manager;
        private final String packageName;
        PackageBackend(Context context) { manager = context.getPackageManager(); packageName = context.getPackageName(); }
        ComponentName component(String theme) { return new ComponentName(packageName, packageName + ".icon." + theme); }
        @Override public boolean enabled(String theme) {
            int state = manager.getComponentEnabledSetting(component(theme));
            return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && Theme.DEFAULT.equals(theme));
        }
        @Override public void enable(String theme) {
            manager.setComponentEnabledSetting(component(theme), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        }
        @Override public void disable(String theme) {
            manager.setComponentEnabledSetting(component(theme), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
        @Override public boolean supportsAtomic() { return Build.VERSION.SDK_INT >= 33; }
        @Override public void replaceAtomically(String chosen) {
            if (Build.VERSION.SDK_INT < 33) throw new UnsupportedOperationException();
            Api33.replace(manager, packageName, chosen);
        }
    }
    /** Separate class avoids loading API-33-only types on older Android runtimes. */
    @android.annotation.TargetApi(33)
    private static final class Api33 {
        static void replace(PackageManager manager, String packageName, String chosen) {
            List<PackageManager.ComponentEnabledSetting> changes = new ArrayList<>();
            for (String theme : Theme.ALL) {
                changes.add(new PackageManager.ComponentEnabledSetting(
                    new ComponentName(packageName, packageName + ".icon." + theme),
                    theme.equals(chosen) ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP));
            }
            manager.setComponentEnabledSettings(changes);
        }
    }
}
