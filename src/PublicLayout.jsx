import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { BLACK_HORSE } from './series';
import './public.css';

export function PublicBrand({ title, children }) {
  return <header className="public-header">
    <a className="public-brand" href={window.location.pathname} aria-label="黑馬記念，返回賽事查詢">
      <span className="public-brand-window"><img src={`${import.meta.env.BASE_URL}brand/black-horse-original.png`} alt="黑馬記念" width="2160" height="3553" fetchPriority="high" /></span>
    </a>
    <div className="public-heading"><h1>{title}</h1>{children}</div>
  </header>;
}

export function PublicBottomNav({ seriesCode, series = false, hasSchedule = false, hasRanking = false, hasEvents = false }) {
  const path = window.location.pathname;
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  const items = series ? [
    ...(hasEvents ? [{ href: '#series-events', label: '場次' }] : []),
    ...(hasRanking ? [{ href: '#series-ranking', label: '排名' }] : [])
  ] : [
    ...(hasSchedule ? [{ href: '#current-round', label: '賽況' }] : []),
    ...(hasRanking ? [{ href: '#event-ranking', label: '排名' }] : []),
    ...(seriesCode ? [{ href: `${path}?series=${seriesCode}`, label: '系列' }] : [])
  ];
  if (items.length < 2) return null;
  const active = items.find(item => item.href === hash) || items[0];
  return <nav className="public-bottom-nav" aria-label="公開頁面導覽">
    {items.map(item => <a key={item.href} href={item.href} aria-current={item === active ? 'location' : undefined}>{item.label}</a>)}
  </nav>;
}

export function PublicNotice({ children, tone = 'info', onRetry }) {
  return <div className={`public-notice public-notice--${tone}`} role={tone === 'info' ? 'status' : 'alert'}>
    <p>{children}</p>{onRetry && <button type="button" className="public-text-action" onClick={onRetry}>重試</button>}
  </div>;
}

export function PublicPlayerSearch({ value, onChange, id = 'public-player-search', children }) {
  return <div className="public-player-search">
    <label className="public-search-field" htmlFor={id}><Search aria-hidden="true" /><span className="sr-only">搜尋打師名</span>
      <input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="搜尋打師名" autoComplete="off" />
    </label>{children}
  </div>;
}

export const publicSeriesName = series => series?.publicCode === BLACK_HORSE.publicCode ? '黑馬記念系列賽' : series?.name;
