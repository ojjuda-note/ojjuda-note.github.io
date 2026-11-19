package kr.ojjuda.icons;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.MonthDay;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** A bounded, data-only calendar. No links, expressions or executable content are consumed. */
public final class CalendarConfig {
    public static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    public static final int MAX_BYTES = 262144;
    private static final int MAX_EVENTS = 512;
    private final String[] months;
    private final List<Event> events;

    private CalendarConfig(String[] months, List<Event> events) {
        this.months = months.clone();
        this.events = Collections.unmodifiableList(new ArrayList<>(events));
    }

    public static CalendarConfig parse(String text) throws JSONException {
        if (text == null || text.length() > MAX_BYTES) throw new JSONException("Calendar is too large");
        JSONObject root = new JSONObject(text);
        if (integer(root, "schemaVersion", -1) != 1 || !"Asia/Seoul".equals(root.optString("timezone")))
            throw new JSONException("Unsupported calendar schema");
        JSONArray themes = root.getJSONArray("themes");
        Set<String> supplied = new HashSet<>();
        for (int i = 0; i < themes.length(); i++) supplied.add(themes.getString(i));
        if (themes.length() != Theme.ALL.length || !supplied.equals(Theme.ALLOWED))
            throw new JSONException("Unexpected theme IDs");
        String[] months = new String[13];
        JSONArray seasons = root.getJSONArray("seasons");
        if (seasons.length() != 4) throw new JSONException("Four seasons required");
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < seasons.length(); i++) {
            JSONObject season = seasons.getJSONObject(i);
            String theme = season.getString("theme");
            if (!(theme.equals("spring") || theme.equals("summer") || theme.equals("autumn") || theme.equals("winter")) || !seen.add(theme))
                throw new JSONException("Invalid season");
            JSONArray list = season.getJSONArray("months");
            if (list.length() == 0) throw new JSONException("Empty season");
            for (int j = 0; j < list.length(); j++) {
                Object value = list.get(j);
                if (!(value instanceof Number) || ((Number) value).doubleValue() != ((Number) value).intValue())
                    throw new JSONException("Invalid month");
                int month = ((Number) value).intValue();
                if (month < 1 || month > 12 || months[month] != null) throw new JSONException("Duplicate month");
                months[month] = theme;
            }
        }
        for (int month = 1; month <= 12; month++) if (months[month] == null) throw new JSONException("Missing month");
        JSONArray annual = root.getJSONArray("annualEvents");
        JSONArray dated = root.getJSONArray("datedEvents");
        if (annual.length() + dated.length() > MAX_EVENTS) throw new JSONException("Too many events");
        List<Event> events = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        readEvents(annual, true, events, ids);
        readEvents(dated, false, events, ids);
        return new CalendarConfig(months, events);
    }

    private static void readEvents(JSONArray array, boolean annual, List<Event> result, Set<String> ids) {
        for (int i = 0; i < array.length(); i++) {
            try {
                JSONObject item = array.getJSONObject(i);
                if (!(item.get("id") instanceof String)) continue;
                String id = item.getString("id"), theme = item.getString("theme");
                int priority = integer(item, "priority", -1);
                if (!id.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,63}") || !Theme.isAllowed(theme) || priority < 0 || priority > 1000) continue;
                String start = item.getString("start"), end = item.getString("end"), eventDate = item.getString("eventDate");
                Event event = new Event(id, theme, priority, annual, start, end, eventDate);
                event.validate();
                if (!ids.add(id)) continue;
                result.add(event);
            } catch (JSONException | DateTimeException | IllegalArgumentException ignored) {
                // A bad individual event must never hide the launcher or prevent seasonal fallback.
            }
        }
    }

    private static int integer(JSONObject item, String key, int fallback) throws JSONException {
        if (!item.has(key)) return fallback;
        Object value = item.get(key);
        if (!(value instanceof Number) || ((Number) value).doubleValue() != ((Number) value).intValue())
            throw new JSONException("Expected integer");
        return ((Number) value).intValue();
    }

    public String select(long epochMillis) { return select(Instant.ofEpochMilli(epochMillis).atZone(SEOUL).toLocalDate()); }

    public String select(LocalDate today) {
        if (today.getYear() < 1 || today.getYear() > 9999) throw new IllegalArgumentException("Unsupported calendar year");
        Occurrence winner = null;
        for (Event event : events) {
            Occurrence candidate = event.on(today);
            if (candidate != null && (winner == null || candidate.precedes(winner, today))) winner = candidate;
        }
        return winner == null ? months[today.getMonthValue()] : winner.event.theme;
    }

    private static LocalDate date(String s) {
        if (!s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException("Invalid date format");
        LocalDate date = LocalDate.parse(s);
        if (date.getYear() < 1) throw new IllegalArgumentException("Invalid year");
        return date;
    }
    private static MonthDay monthDay(String s) {
        if (!s.matches("[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException("Invalid annual date format");
        return MonthDay.parse("--" + s);
    }
    private static LocalDate atYear(MonthDay day, int year) {
        return LocalDate.of(year, day.getMonthValue(), day.getDayOfMonth());
    }

    private static final class Event {
        final String id, theme, start, end, eventDate;
        final int priority;
        final boolean annual;
        Event(String id, String theme, int priority, boolean annual, String start, String end, String eventDate) {
            this.id = id; this.theme = theme; this.priority = priority; this.annual = annual;
            this.start = start; this.end = end; this.eventDate = eventDate;
        }
        void validate() {
            if (annual) {
                MonthDay a = monthDay(start), b = monthDay(end), c = monthDay(eventDate);
                if (!within(c, a, b))
                    throw new IllegalArgumentException("Invalid annual interval");
            } else {
                LocalDate a = date(start), b = date(end), c = date(eventDate);
                if (b.isBefore(a) || c.isBefore(a) || c.isAfter(b))
                    throw new IllegalArgumentException("Invalid interval");
            }
        }
        Occurrence on(LocalDate today) {
            if (!annual) {
                LocalDate first = date(start), last = date(end);
                return today.isBefore(first) || today.isAfter(last) ? null : new Occurrence(this, date(eventDate));
            }
            MonthDay a = monthDay(start), b = monthDay(end), c = monthDay(eventDate);
            MonthDay now = MonthDay.from(today);
            if (!within(now, a, b)) return null;
            int year = today.getYear();
            if (a.compareTo(b) > 0) {
                int firstYear = year - (now.compareTo(b) <= 0 ? 1 : 0);
                year = firstYear + (c.compareTo(a) < 0 ? 1 : 0);
            }
            if (year < 1 || year > 9999) return null;
            try { return new Occurrence(this, atYear(c, year)); }
            catch (DateTimeException ignored) { return null; }
        }
        static boolean within(MonthDay value, MonthDay start, MonthDay end) {
            return start.compareTo(end) <= 0
                ? value.compareTo(start) >= 0 && value.compareTo(end) <= 0
                : value.compareTo(start) >= 0 || value.compareTo(end) <= 0;
        }
    }
    private static final class Occurrence {
        final Event event;
        final LocalDate date;
        Occurrence(Event event, LocalDate date) { this.event = event; this.date = date; }
        boolean precedes(Occurrence other, LocalDate today) {
            boolean now = date.equals(today), otherNow = other.date.equals(today);
            if (now != otherNow) return now;
            if (event.priority != other.event.priority) return event.priority > other.event.priority;
            long distance = Math.abs(ChronoUnit.DAYS.between(today, date));
            long otherDistance = Math.abs(ChronoUnit.DAYS.between(today, other.date));
            if (distance != otherDistance) return distance < otherDistance;
            return event.id.compareTo(other.event.id) < 0;
        }
    }
}
