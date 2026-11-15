import React from 'react';
import { Trophy, ListOrdered, Layers, Search } from 'lucide-react';
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

export function PublicBottomNav({ seriesCode = BLACK_HORSE.publicCode, series = false, hasEvent = false }) {
  const path = window.location.pathname;
  return <nav className="public-bottom-nav" aria-label="公開頁面導覽">
    <a href={series ? `${path}#public-lookup` : hasEvent ? '#current-round' : '#public-lookup'} aria-current={!series ? 'page' : undefined}><Trophy aria-hidden="true" /><span>賽況</span></a>
    <a href={series ? '#series-ranking' : hasEvent ? '#event-ranking' : `${path}?series=${seriesCode}#series-ranking`}><ListOrdered aria-hidden="true" /><span>排名</span></a>
    <a href={series ? '#series-events' : `${path}?series=${seriesCode}`} aria-current={series ? 'page' : undefined}><Layers aria-hidden="true" /><span>系列</span></a>
  </nav>;
}

export function PublicPlayerSearch({ value, onChange, id = 'public-player-search', children }) {
  return <div className="public-player-search">
    <label className="public-search-field" htmlFor={id}><Search aria-hidden="true" /><span className="sr-only">搜尋打師名</span>
      <input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="搜尋打師名" autoComplete="off" />
    </label>{children}
  </div>;
}

export const publicSeriesName = series => series?.publicCode === BLACK_HORSE.publicCode ? '黑馬記念系列賽' : series?.name;
