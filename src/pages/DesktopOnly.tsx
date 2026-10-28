import { useEffect, useState, type ReactNode } from 'react'

function supportsDesktopStreaming() {
  return window.matchMedia('(min-width: 900px) and (pointer: fine)').matches
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  const [desktopSupported, setDesktopSupported] = useState(supportsDesktopStreaming)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 900px) and (pointer: fine)')
    const updateSupport = () => setDesktopSupported(media.matches)
    media.addEventListener('change', updateSupport)
    return () => media.removeEventListener('change', updateSupport)
  }, [])

  if (!desktopSupported) {
    return (
      <section className="section page-state desktop-required" role="status">
        <div className="eyebrow"><span className="eyebrow-dot" /> DESKTOP REQUIRED</div>
        <h1>Continue on a computer<span>.</span></h1>
        <p>Live streaming, stream setup, and video playback are available on desktop or laptop browsers only.</p>
      </section>
    )
  }

  return children
}
