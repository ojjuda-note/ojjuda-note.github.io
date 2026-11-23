package kr.ojjuda.icons;

import org.json.JSONObject;
import org.junit.Test;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDate;
import static org.junit.Assert.*;

public class CalendarConfigTest {
    static String fixture() throws Exception {
        return new String(Files.readAllBytes(Paths.get(System.getProperty("calendar.fixture"))), StandardCharsets.UTF_8);
    }
    @Test public void holidaysBeginSevenDaysBeforeAndRecoverAfterEnd() throws Exception {
        CalendarConfig calendar = CalendarConfig.parse(fixture());
        assertEquals("winter", calendar.select(LocalDate.parse("2026-12-17")));
        assertEquals("christmas", calendar.select(LocalDate.parse("2026-12-18")));
        assertEquals("christmas", calendar.select(LocalDate.parse("2026-12-25")));
        assertEquals("newyear", calendar.select(LocalDate.parse("2026-12-26")));
        assertEquals("newyear", calendar.select(LocalDate.parse("2027-01-01")));
        assertEquals("winter", calendar.select(LocalDate.parse("2027-01-02")));
        JSONObject root = new JSONObject(fixture());
        for (int i = 0; i < root.getJSONArray("datedEvents").length(); i++) {
            JSONObject event = root.getJSONArray("datedEvents").getJSONObject(i);
            LocalDate day = LocalDate.parse(event.getString("eventDate"));
            assertEquals(day.minusDays(7).toString(), event.getString("start"));
            assertEquals(day.plusDays(1).toString(), event.getString("end"));
            assertEquals(event.getString("theme"), calendar.select(day.minusDays(7)));
            assertEquals(event.getString("theme"), calendar.select(day));
            assertEquals(event.getString("theme"), calendar.select(day.plusDays(1)));
            assertNotEquals(event.getString("theme"), calendar.select(day.plusDays(2)));
        }
    }
    @Test public void kstMidnightIsNotUtcMidnight() throws Exception {
        CalendarConfig calendar = CalendarConfig.parse(fixture());
        assertEquals("winter", calendar.select(Instant.parse("2026-12-17T14:59:59Z").toEpochMilli()));
        assertEquals("christmas", calendar.select(Instant.parse("2026-12-17T15:00:00Z").toEpochMilli()));
        assertEquals("spring", calendar.select(Instant.parse("2027-02-28T15:00:00Z").toEpochMilli()));
    }
    @Test public void observedHolidayBeatsHigherPriorityUpcomingEvent() throws Exception {
        JSONObject root = new JSONObject(fixture());
        root.getJSONArray("datedEvents").put(new JSONObject("{\"id\":\"custom-a\",\"theme\":\"summer\",\"priority\":900,\"start\":\"2026-12-20\",\"end\":\"2026-12-30\",\"eventDate\":\"2026-12-30\"}"));
        assertEquals("christmas", CalendarConfig.parse(root.toString()).select(LocalDate.parse("2026-12-25")));
        assertEquals("summer", CalendarConfig.parse(root.toString()).select(LocalDate.parse("2026-12-26")));
    }
    @Test public void malformedEventsCannotIntroduceNewResources() throws Exception {
        JSONObject root = new JSONObject(fixture());
        root.getJSONArray("datedEvents").put(new JSONObject("{\"id\":\"remote\",\"theme\":\"https://bad.example/code\",\"priority\":1000,\"start\":\"2026-07-01\",\"end\":\"2026-07-31\",\"eventDate\":\"2026-07-14\"}"));
        root.getJSONArray("datedEvents").put(new JSONObject("{\"id\":\"invalid-date\",\"theme\":\"winter\",\"priority\":1000,\"start\":\"2026-02-30\",\"end\":\"2026-07-31\",\"eventDate\":\"2026-07-14\"}"));
        assertEquals("summer", CalendarConfig.parse(root.toString()).select(LocalDate.parse("2026-07-14")));
    }
    @Test public void corruptConfigIsRejectedForCallerToUseBundledCalendar() throws Exception {
        JSONObject root = new JSONObject(fixture());
        root.put("timezone", "UTC");
        try { CalendarConfig.parse(root.toString()); fail("UTC config accepted"); }
        catch (org.json.JSONException expected) { }
    }
    @Test public void duplicateEventIdsKeepFirstValidEntry() throws Exception {
        JSONObject root = new JSONObject(fixture());
        String prefix = "{\"id\":\"custom.one\",\"priority\":300,\"start\":\"2026-07-01\",\"end\":\"2026-07-08\",\"eventDate\":\"2026-07-08\",\"theme\":";
        root.getJSONArray("datedEvents").put(new JSONObject(prefix + "\"winter\"}"));
        root.getJSONArray("datedEvents").put(new JSONObject(prefix + "\"autumn\"}"));
        assertEquals("winter", CalendarConfig.parse(root.toString()).select(LocalDate.parse("2026-07-08")));
    }
}
