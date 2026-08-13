import React from 'react';

export default function FullScreenCloudManager({ children }) {
  return (
    <div data-testid="cloud-management-page" className="fixed inset-0 z-50">
      <div className="w-full h-full shadow-2xl flex flex-col bg-[#0d0f12]">
        {children}
      </div>
    </div>
  );
}
