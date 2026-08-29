import Link from "next/link";
import {
  calendarGrid,
  dayKey,
  formatMonthLabel,
  shiftMonth,
} from "@/lib/meetTime";

export type FlashMeeting = {
  id: string;
  title: string;
  meet_at: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 번개모임 달력. 그 달의 모임을 날짜 칸에 스케줄처럼 얹는다.
 * 보고 있는 달은 URL(`month=YYYY-MM`)에 있어 새로고침해도 그대로다.
 */
export function FlashCalendar({
  month,
  meetings,
  today,
}: {
  month: string;
  meetings: FlashMeeting[];
  today: string;
}) {
  const cells = calendarGrid(month);

  const byDay = new Map<string, FlashMeeting[]>();
  for (const meeting of meetings) {
    const key = dayKey(meeting.meet_at);
    const list = byDay.get(key);
    if (list) list.push(meeting);
    else byDay.set(key, [meeting]);
  }

  return (
    <section className="calendar" aria-label={`${formatMonthLabel(month)} 번개모임`}>
      <div className="calendar-head">
        <Link
          href={`/clubs?kind=flash&month=${shiftMonth(month, -1)}`}
          aria-label="이전 달"
          className="btn"
        >
          ←
        </Link>
        <strong>{formatMonthLabel(month)}</strong>
        <Link
          href={`/clubs?kind=flash&month=${shiftMonth(month, 1)}`}
          aria-label="다음 달"
          className="btn"
        >
          →
        </Link>
      </div>

      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar-weekday" role="columnheader">
            {day}
          </div>
        ))}

        {cells.map((cell) => {
          const dayMeetings = byDay.get(cell.key) ?? [];
          const classes = [
            "calendar-day",
            cell.inMonth ? "" : "calendar-day-out",
            cell.key === today ? "calendar-day-today" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={cell.key} className={classes} role="gridcell">
              <span className="calendar-date">{Number(cell.key.slice(8))}</span>
              {dayMeetings.map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/clubs/${meeting.id}`}
                  className="calendar-chip"
                  title={meeting.title}
                >
                  {meeting.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
