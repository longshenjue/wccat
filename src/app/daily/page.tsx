import Link from "next/link";
import { DailyWorkbench } from "@/components/daily-workbench";
import { getDailyReport } from "@/lib/daily-report";
import { listDailyReportDatesFromDb } from "@/lib/db";
import "@/components/daily-archive.css";

export const dynamic = "force-dynamic";

type DailyPageProps = {
  searchParams?: Promise<{ date?: string; month?: string }>;
};

export default async function DailyPage({ searchParams }: DailyPageProps) {
  const params = (await searchParams) ?? {};
  const dates = listDailyReportDatesFromDb();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month : undefined;
  const selectedDate = params.date ?? (month ? dates.find(date => date.startsWith(month)) : undefined);
  const report = month && !selectedDate ? null : getDailyReport(selectedDate);
  const selectedMonth = month ?? report?.reportDate.slice(0,7);
  const visibleDates = selectedMonth ? dates.filter(date => date.startsWith(selectedMonth)) : dates;
  const months = [...new Set(dates.map(date => date.slice(0,7)))];

  return (
    <main className="shell daily-shell">
      <aside className="left-rail">
        <div className="brand-card">
          <h1 className="brand-logo">
            <span className="brand-wc">Wc</span>
            <span className="brand-cat">CAT</span>
          </h1>
          <p>每日内容稿</p>
        </div>

        <nav className="nav-card" aria-label="模式">
          <span className="nav-title">Mode</span>
          <Link className="nav-link" href="/">
            小时榜
          </Link>
          <Link className="active nav-link" href="/daily">
            日报
          </Link>
        </nav>

        <section className="nav-card daily-archive-nav">
          <span className="nav-title">Daily Archive</span>
          {months.length > 0 ? <form action="/daily" className="daily-archive-form"><label htmlFor="daily-archive-month">按月份查看</label><select id="daily-archive-month" name="month" defaultValue={selectedMonth}>{months.map(value=><option key={value} value={value}>{value}</option>)}</select><button type="submit">查看月份</button></form> : null}
          {dates.length > 0 ? (
            visibleDates.map((date) => (
              <Link
                className={date === report?.reportDate ? "active nav-link" : "nav-link"}
                href={`/daily?date=${date}`}
                key={date}
              >
                {date}
              </Link>
            ))
          ) : (
            <p className="empty-note">还没有生成日报。</p>
          )}
        </section>
      </aside>

      {report ? (
        <DailyWorkbench report={report} />
      ) : (
        <section className="content">
          <section className="topbar daily-topbar">
            <div>
              <p className="eyebrow">Daily Radar</p>
              <h2>还没有日报内容</h2>
              <p className="daily-overview">
                日报正在准备中，请稍后查看。
              </p>
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
