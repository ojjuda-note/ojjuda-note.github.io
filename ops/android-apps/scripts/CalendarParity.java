import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDate;
import kr.ojjuda.icons.CalendarConfig;

/** Prints one theme per day so scripts can compare the Android and shared JS rules. */
public final class CalendarParity {
    public static void main(String[] args) throws Exception {
        CalendarConfig calendar = CalendarConfig.parse(new String(Files.readAllBytes(Paths.get(args[0])), StandardCharsets.UTF_8));
        LocalDate end = LocalDate.parse(args[2]);
        for (LocalDate date = LocalDate.parse(args[1]); !date.isAfter(end); date = date.plusDays(1)) {
            System.out.println(date + " " + calendar.select(date));
        }
    }
}
