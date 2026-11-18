import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Globalantic Training — software development training and internships';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social share image (1200×630) with the real logo (the shared @globalantic/ui asset). */
export default async function OpengraphImage() {
  const svg = await fetch(new URL('../packages/ui/src/assets/logo.svg', import.meta.url)).then((r) => r.text());
  const logo = `data:image/svg+xml;base64,${btoa(svg)}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #17132A 0%, #0D0B17 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} width={96} height={96} />
          <span style={{ fontSize: 44, fontWeight: 800 }}>Globalantic Training</span>
        </div>
        <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1, maxWidth: 960 }}>Practical training and internships in software development</div>
        <div style={{ fontSize: 30, color: '#A66CFF', marginTop: 28, fontWeight: 600 }}>Online · Offline · Hybrid batches · Verifiable certificates</div>
      </div>
    ),
    { ...size },
  );
}
