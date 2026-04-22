import sharp from 'sharp';
import fs from 'fs/promises';

const W = 760;
const H = 170;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="burgundy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7A1E2B"/>
      <stop offset="1" stop-color="#5F1621"/>
    </linearGradient>
    <linearGradient id="cream" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F4EBDE"/>
      <stop offset="1" stop-color="#EDE1CF"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"/>
    </filter>
    <clipPath id="roundedAll">
      <rect width="${W}" height="${H}" rx="10"/>
    </clipPath>
  </defs>

  <g clip-path="url(#roundedAll)">
    <!-- LEFT PANEL (burgundy) -->
    <rect x="0" y="0" width="500" height="${H}" fill="url(#burgundy)"/>
    <rect x="0" y="0" width="500" height="${H}" filter="url(#grain)"/>

    <!-- Kicker -->
    <text x="40" y="50" font-family="Menlo, 'Courier New', monospace" font-size="12" fill="#F4EBDE" fill-opacity="0.7" letter-spacing="4">§ AN INVITATION</text>

    <!-- Hero invitation -->
    <text x="40" y="102" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#F4EBDE" xml:space="preserve"><tspan>Click here to </tspan><tspan font-weight="bold" font-style="italic">explore my work</tspan></text>

    <!-- thin accent rule -->
    <rect x="40" y="122" width="64" height="2" fill="#F4EBDE" fill-opacity="0.6"/>

    <!-- Small supporting line -->
    <text x="40" y="148" font-family="Georgia, 'Times New Roman', serif" font-size="14" fill="#F4EBDE" fill-opacity="0.7" font-style="italic">Research, full-text papers, and audio companions — all in one place.</text>

    <!-- RIGHT PANEL (cream) -->
    <rect x="500" y="0" width="260" height="${H}" fill="url(#cream)"/>

    <!-- Header -->
    <text x="524" y="38" font-family="Menlo, 'Courier New', monospace" font-size="10" fill="#1A1612" fill-opacity="0.55" letter-spacing="2">YARIV · EST. 2026</text>
    <line x1="524" y1="48" x2="736" y2="48" stroke="#1A1612" stroke-opacity="0.15" stroke-width="1"/>
    <circle cx="718" cy="38" r="4" fill="#7A1E2B"/>

    <!-- Name -->
    <text x="524" y="92" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="#1A1612" font-weight="500">Yariv Itzkovich, PhD.</text>

    <!-- Research focus -->
    <text x="524" y="118" font-family="Georgia, 'Times New Roman', serif" font-size="12" fill="#1A1612" fill-opacity="0.75" font-style="italic">Organizational mistreatment research</text>

    <!-- Panel separator -->
    <line x1="500" y1="0" x2="500" y2="${H}" stroke="#1A1612" stroke-opacity="0.12" stroke-width="1"/>
  </g>
</svg>`;

await fs.writeFile('/Users/yarivitzkovich/Downloads/yarivitzkovich-signature-banner.svg', svg);

await sharp(Buffer.from(svg))
  .resize(W * 2, H * 2)
  .png({ quality: 95 })
  .toFile('/Users/yarivitzkovich/Downloads/yarivitzkovich-signature-banner.png');

// also copy to site so OWA can reference same file if needed
await sharp(Buffer.from(svg))
  .resize(W * 2, H * 2)
  .png({ quality: 95 })
  .toFile('/Users/yarivitzkovich/Code/yarivitzkovich-site/public/images/signature-banner.png');

console.log('Banner updated:');
console.log('  ~/Downloads/yarivitzkovich-signature-banner.png');
