import React from 'react';

export default function SeriesEventPoints({ standing, eventCode }) {
  const points = standing.eventPoints[eventCode];
  const counted = !standing.countedEvents || standing.countedEvents.includes(eventCode);
  const status = points == null ? '尚無成績' : counted ? '計入總分' : '未計入總分';
  return <span className={`series-event-points ${counted && points != null ? 'is-counted' : 'is-discarded'}`}
    title={status} aria-label={`${points ?? (standing.countedEvents ? '—' : 0)} 分，${status}`}>
    {points ?? (standing.countedEvents ? '—' : 0)}
  </span>;
}
