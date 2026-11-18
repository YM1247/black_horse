import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function QrImage({ url, eventCode, name }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setImage('');
    setError(false);
    Promise.resolve().then(() => QRCode.toDataURL(url, {
      type: 'image/png', width: 1024, margin: 4, errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    })).then(value => { if (active) setImage(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [url, attempt]);
  if (error) return <div role="alert">QR Code 產生失敗。<button type="button" onClick={() => setAttempt(value => value + 1)}>重新產生</button></div>;
  if (!image) return <p role="status">正在產生 QR Code…</p>;
  return <div className="flex flex-col items-start gap-3">
    <img src={image} alt={`${name}公開連結 QR Code`} width={192} height={192} className="max-w-full h-auto" />
    <a href={image} download={`${eventCode}-qrcode.png`} className="underline underline-offset-4">下載 QR Code（PNG）</a>
  </div>;
}

export default function EventPublicQr({ eventCode, name, isPublic }) {
  const [open, setOpen] = useState(false);
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('event', eventCode);
  return <details className="my-3" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer">公開連結與 QR Code</summary>
    {open && <div className="mt-3 space-y-3">
      <a href={url.href} target="_blank" rel="noreferrer" className="block break-all underline underline-offset-4">{url.href}</a>
      {!isPublic && <p>本場尚未公開；開啟公開後，觀眾才能透過此連結查看賽事。</p>}
      <QrImage key={url.href} url={url.href} eventCode={eventCode} name={name} />
    </div>}
  </details>;
}
