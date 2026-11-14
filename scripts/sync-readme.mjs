import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const USERNAME = 'btvdev03';
const PROFILE_DATA_RAW_URL = `https://raw.githubusercontent.com/${USERNAME}/${USERNAME}.github.io/main/profile-data.js`;
const LOCAL_PROFILE_DATA = path.resolve(ROOT, `../${USERNAME}.github.io/profile-data.js`);

/** Optional metadata fallback for public repos not yet listed in profile-data.js */
const EXTRA_REPO_META = {
  glance: {
    label: '⚡ Glance',
    desc: 'Tiện ích mở rộng trình duyệt (Chrome MV3) dịch chuột tức thì thông minh, cô lập giao diện bằng Closed Shadow DOM & phát âm IPA.',
    stack: ['JavaScript', 'Chrome MV3', 'Shadow DOM'],
    demo: 'https://btvdev03.github.io/Glance/',
    featured: true,
  },
  'season-qr': {
    label: '🌸 SeasonQR',
    desc: 'Trình tạo mã QR 3D nghệ thuật theo 4 mùa, 3D Photo Sculpture & Halftone Photo QR chuẩn phục hồi lỗi Level H, xử lý 100% client-side.',
    stack: ['React 19', 'TypeScript', 'Three.js', 'Tailwind v4'],
    demo: 'https://btvdev03.github.io/season-qr/',
    featured: true,
  },
};

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': `${USERNAME}-profile-sync`,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function loadProfileData() {
  let source = '';
  if (fs.existsSync(LOCAL_PROFILE_DATA) && process.env.FORCE_REMOTE_PROFILE_DATA !== '1') {
    source = fs.readFileSync(LOCAL_PROFILE_DATA, 'utf8');
  } else {
    const res = await fetch(PROFILE_DATA_RAW_URL, { headers: githubHeaders() });
    if (!res.ok) {
      throw new Error(`Cannot load profile-data.js (${res.status})`);
    }
    source = await res.text();
  }

  const sandbox = { window: {}, module: { exports: {} } };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return sandbox.window.PROFILE_DATA || sandbox.module.exports;
}

function repoNameFromUrl(url) {
  if (!url) return '';
  const cleaned = url.replace(/\/+$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || '';
}

function findSocialUrl(socials, key, fallback) {
  const hit = (socials || []).find((s) => (s.icon || s.name || '').toLowerCase().includes(key));
  return hit?.url || fallback;
}

function escapePipe(str) {
  return String(str || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function buildReadme(data, user, repos) {
  const p = data.profile || {};
  const socials = data.socials || [];
  const linkedinUrl = findSocialUrl(socials, 'linkedin', `https://www.linkedin.com/in/${USERNAME}`);
  const emailUrl = findSocialUrl(socials, 'mail', `mailto:${p.email || 'btv.dev03@gmail.com'}`);
  const facebookUrl = findSocialUrl(socials, 'facebook', `https://www.facebook.com/${USERNAME}`);
  const portfolioUrl = `https://${USERNAME}.github.io`;

  const repoMap = new Map();
  for (const r of repos) {
    repoMap.set(r.name.toLowerCase(), r);
  }

  // Filter active work roles & M.Sc academic milestone from timeline
  const timeline = data.timeline || [];
  const msc = timeline.find((t) => t.id === 'tdmu-msc' || (t.type === 'academic' && /cao học|m\.sc/i.test(t.title)));
  const workItems = timeline.filter((t) => t.type === 'work');

  const introBullets = [];
  if (msc) {
    introBullets.push(
      `- 🎓 **Học thuật:** ${msc.title} (${msc.period}) tại **${msc.organization}** — ${msc.description}`
    );
  }
  for (const w of workItems) {
    const siteLink = w.website ? ` ([${w.websiteLabel || w.website}](${w.website}))` : '';
    introBullets.push(
      `- 💼 **${w.title} (${w.period}):** **${w.organization}**${siteLink} — ${w.description}`
    );
  }
  introBullets.push(
    `- 🌐 **Portfolio & LinkedIn:** [**${USERNAME}.github.io**](${portfolioUrl}) · [**linkedin.com/in/${USERNAME}**](${linkedinUrl})`
  );

  // Research focus areas
  const focusBullets = (data.research?.focusAreas || []).map(
    (f) => `- **${f.title}:** ${f.desc}`
  );

  // Build Featured Projects rows (from profile-data.js + featured extras like SeasonQR)
  const seenRepos = new Set([USERNAME.toLowerCase()]);
  const projectRows = [];

  for (const proj of data.projects || []) {
    const repoKey = repoNameFromUrl(proj.githubUrl).toLowerCase();
    const gh = repoMap.get(repoKey);
    if (repoKey) seenRepos.add(repoKey);

    const stars = gh?.stargazers_count || 0;
    const starTag = stars > 0 ? ` \`★ ${stars}\`` : '';
    const stack = (proj.techStack || []).slice(0, 4).map((t) => `\`${t}\``).join(' ');
    const liveUrl = proj.demoUrl || gh?.homepage || '';
    const linkCol = [
      proj.githubUrl ? `[GitHub](${proj.githubUrl})` : '',
      liveUrl ? `[Live ↗](${liveUrl})` : '',
    ].filter(Boolean).join(' · ');

    const nameCol = proj.githubUrl
      ? `**[${escapePipe(proj.name)}](${proj.githubUrl})**`
      : `**${escapePipe(proj.name)}**`;

    projectRows.push(
      `| ${nameCol}${starTag} | ${escapePipe(proj.description || proj.tagline)} | ${stack} | ${linkCol} |`
    );
  }

  for (const [key, meta] of Object.entries(EXTRA_REPO_META)) {
    if (seenRepos.has(key) || !meta.featured) continue;
    const gh = repoMap.get(key);
    if (!gh) continue;
    seenRepos.add(key);

    const stars = gh.stargazers_count || 0;
    const starTag = stars > 0 ? ` \`★ ${stars}\`` : '';
    const stack = meta.stack.map((t) => `\`${t}\``).join(' ');
    const liveUrl = gh.homepage || meta.demo || '';
    const linkCol = `[GitHub](${gh.html_url})` + (liveUrl ? ` · [Live ↗](${liveUrl})` : '');

    projectRows.push(
      `| **[${escapePipe(meta.label)}](${gh.html_url})**${starTag} | ${escapePipe(gh.description || meta.desc)} | ${stack} | ${linkCol} |`
    );
  }

  // Remaining public non-fork repos discovered automatically from GitHub API
  const otherRepos = repos.filter(
    (r) => !r.fork && !r.archived && !seenRepos.has(r.name.toLowerCase())
  );
  const otherSection = otherRepos.length
    ? [
        '',
        '<details>',
        `<summary>📦 Kho lưu trữ công khai khác (${otherRepos.length} repo tự đồng bộ từ GitHub)</summary>`,
        '',
        '| Kho lưu trữ | Ngôn ngữ | Sao | Mô tả |',
        '| :--- | :--- | :---: | :--- |',
        ...otherRepos.map((r) => {
          const lang = r.language ? `\`${r.language}\`` : '—';
          const desc = escapePipe(r.description || 'Public repository');
          return `| **[${r.name}](${r.html_url})** | ${lang} | ★ ${r.stargazers_count} | ${desc} |`;
        }),
        '',
        '</details>',
      ].join('\n')
    : '';

  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const publicCount = user?.public_repos ?? repos.length;

  return `<div align="center">

# ${p.name || 'Võ Tấn Bản'} (${p.brandName || 'Ban Vo Tan'})

**${p.title || 'Kỹ sư Phần mềm & Học viên Cao học Hệ thống Thông tin'}**  
*${p.institution || 'Trường Đại học Thủ Dầu Một (TDMU)'} · ${p.location || 'Bình Dương & Đồng Tháp, Việt Nam'}*

[![Portfolio](https://img.shields.io/badge/Portfolio-${USERNAME}.github.io-1e1c1b?style=flat-square&logo=googlechrome&logoColor=white)](${portfolioUrl})
[![LinkedIn](https://img.shields.io/badge/LinkedIn-${USERNAME}-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](${linkedinUrl})
[![Email](https://img.shields.io/badge/Email-${encodeURIComponent(p.email || 'btv.dev03@gmail.com')}-EA4335?style=flat-square&logo=gmail&logoColor=white)](${emailUrl})
[![Facebook](https://img.shields.io/badge/Facebook-${USERNAME}-1877F2?style=flat-square&logo=facebook&logoColor=white)](${facebookUrl})

*${p.bioShort || ''}*

</div>

---

### 👋 Giới thiệu & Công tác

${introBullets.join('\n')}

---

### 🔬 Hướng nghiên cứu

${focusBullets.join('\n')}

---

### 🚀 Dự án & Kho lưu trữ (${publicCount} public repos · ★ ${totalStars})

| Dự án | Mô tả | Công nghệ | Liên kết |
| :--- | :--- | :--- | :--- |
${projectRows.join('\n')}
${otherSection}

---

### 💻 Năng lực kỹ thuật

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://skillicons.dev/icons?i=ts,js,py,java,react,vite,threejs,tailwind,nodejs,fastapi,postgres,mongodb,docker,git,linux,githubactions&perline=8&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://skillicons.dev/icons?i=ts,js,py,java,react,vite,threejs,tailwind,nodejs,fastapi,postgres,mongodb,docker,git,linux,githubactions&perline=8&theme=light" />
    <img src="https://skillicons.dev/icons?i=ts,js,py,java,react,vite,threejs,tailwind,nodejs,fastapi,postgres,mongodb,docker,git,linux,githubactions&perline=8&theme=dark" alt="Tech Stack" />
  </picture>
</div>

---

### 📊 Hoạt động GitHub

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-profile-summary-cards.vercel.app/api/cards/profile-details?username=${USERNAME}&theme=github_dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://github-profile-summary-cards.vercel.app/api/cards/profile-details?username=${USERNAME}&theme=default" />
    <img src="https://github-profile-summary-cards.vercel.app/api/cards/profile-details?username=${USERNAME}&theme=default" alt="GitHub Profile Details" />
  </picture>
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-profile-summary-cards.vercel.app/api/cards/stats?username=${USERNAME}&theme=github_dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://github-profile-summary-cards.vercel.app/api/cards/stats?username=${USERNAME}&theme=default" />
    <img src="https://github-profile-summary-cards.vercel.app/api/cards/stats?username=${USERNAME}&theme=default" alt="GitHub Stats" />
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-profile-summary-cards.vercel.app/api/cards/repos-per-language?username=${USERNAME}&theme=github_dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://github-profile-summary-cards.vercel.app/api/cards/repos-per-language?username=${USERNAME}&theme=default" />
    <img src="https://github-profile-summary-cards.vercel.app/api/cards/repos-per-language?username=${USERNAME}&theme=default" alt="Top Languages" />
  </picture>
</div>

---

<div align="center">
  <sub>🔄 Tự động đồng bộ từ <a href="${portfolioUrl}">${USERNAME}.github.io</a> &amp; GitHub API · 📬 <a href="${emailUrl}">${p.email || 'btv.dev03@gmail.com'}</a> · 🔗 <a href="${linkedinUrl}">LinkedIn</a></sub>
</div>
`;
}

async function main() {
  const [data, user, repos] = await Promise.all([
    loadProfileData(),
    fetchJson(`https://api.github.com/users/${USERNAME}`),
    fetchJson(`https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`),
  ]);

  const nextReadme = buildReadme(data, user, repos);
  const targetPath = path.join(ROOT, 'README.md');
  const prevReadme = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';

  if (nextReadme === prevReadme) {
    console.log('README.md already up to date.');
    return;
  }

  fs.writeFileSync(targetPath, nextReadme, 'utf8');
  console.log(`Updated README.md (${repos.length} repos fetched, ${user.public_repos} public).`);
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
