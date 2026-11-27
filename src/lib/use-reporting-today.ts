import { useEffect, useState } from "react";
import { nextReportingMidnight, reportingToday } from "./reporting-period";

export function useReportingToday() {
  const [today, setToday] = useState(() => reportingToday());
  useEffect(() => {
    let timer: number;
    const update = () => {
      const now = Date.now();
      const day = reportingToday(new Date(now));
      setToday(day);
      window.clearTimeout(timer);
      timer = window.setTimeout(update, nextReportingMidnight(now, day) - now);
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}
