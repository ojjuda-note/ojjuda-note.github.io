package kr.ojjuda.icons;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Resource IDs are compiled into the application; remote data cannot add one. */
public final class Theme {
    public static final String DEFAULT = "summer";
    public static final String[] ALL = {
        "spring", "summer", "autumn", "winter", "newyear", "seollal", "chuseok", "christmas"
    };
    public static final Set<String> ALLOWED = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(ALL)));
    private Theme() {}
    public static boolean isAllowed(String id) { return ALLOWED.contains(id); }
}
