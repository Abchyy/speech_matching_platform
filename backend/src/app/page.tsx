export default function HomePage() {
  return (
    <main>
      <h1>Speech Matching Platform API</h1>
      <p>M1-A.1 Vertical Slice。当前仅提供后端接口，不含完整前端。</p>
      <ul>
        <li>GET /api/health</li>
        <li>POST /api/match</li>
        <li>POST /api/profile/generate</li>
        <li>POST /api/speeches/recommend</li>
        <li>POST /api/assets/generate</li>
        <li>POST /api/material/generate</li>
      </ul>
    </main>
  );
}
