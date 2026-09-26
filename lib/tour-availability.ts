export type TourWindow = { start: string; end: string };

type MemberTourAvailability = { memberId: string; name: string; windows: TourWindow[] };

function normalized(windows: TourWindow[]) {
  return windows
    .map((window) => ({ start: new Date(window.start), end: new Date(window.end) }))
    .filter((window) => Number.isFinite(window.start.getTime()) && Number.isFinite(window.end.getTime()) && window.end > window.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function findSharedTourWindows(members: MemberTourAvailability[], minimumMinutes = 30): TourWindow[] {
  if (members.length === 0 || members.some((member) => member.windows.length === 0)) return [];
  let intersections = normalized(members[0].windows);
  for (const member of members.slice(1)) {
    const candidate = normalized(member.windows);
    intersections = intersections.flatMap((left) => candidate.flatMap((right) => {
      const start = new Date(Math.max(left.start.getTime(), right.start.getTime()));
      const end = new Date(Math.min(left.end.getTime(), right.end.getTime()));
      return end.getTime() - start.getTime() >= minimumMinutes * 60_000 ? [{ start, end }] : [];
    }));
  }
  return intersections
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 8)
    .map((window) => ({ start: window.start.toISOString(), end: window.end.toISOString() }));
}
