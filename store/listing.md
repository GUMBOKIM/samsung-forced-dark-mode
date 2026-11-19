# Chrome Web Store submission

Everything below is pasted into the Chrome Web Store developer dashboard. The package is `dist/extension.zip` from `npm run extension`.

## Store listing

**Name:** Forced Dark Preview for Samsung Internet

**Summary** (from `manifest.json`, 120 of 132 characters):
See how Samsung Internet's forced dark mode would paint any page, measured on a real phone. Unofficial. Click to toggle.

**Category:** Developer Tools

**Language:** English (add Korean as a second listing language)

**Description (English):**

Samsung Internet on Android repaints websites in dark colors on its own when the phone is in dark mode, even if the site has no dark theme. Logos, buttons and brand colors can end up looking quite different from what you designed, and desktop browsers cannot show you what happened.

Forced Dark Preview shows it in Chrome. Click the toolbar button and the current page is repainted the way Samsung Internet's forced dark mode would paint it. Click again and the page goes back to normal.

How close is it? The conversion rules were measured on a real Galaxy phone running Samsung Internet 31.0. On a test page, 97.2% of the element and color combinations matched the phone. Chrome's own auto dark mode, for comparison, matched 8.8%, because it uses a different method.

What gets converted:
• Backgrounds, text, borders, outlines, shadows and gradients, each with its own brightness range
• Form fields and buttons
• Inline SVG, SVG images and small dark icons, using the same size rules as the phone
• Photos and background images, which are dimmed
• Frames from other sites, and pages with a strict Content Security Policy

Good to know:
• Pair it with Chrome DevTools device mode to see the page at phone size.
• Colors that only appear on hover or focus are not converted.
• It imitates the phone's painting step in the page itself, so small differences remain.

Unofficial project, not affiliated with Samsung Electronics. Open source: https://github.com/GUMBOKIM/samsung-forced-dark-mode

**Description (Korean):**

안드로이드의 삼성 인터넷은 폰이 다크 모드일 때 다크 테마가 없는 사이트도 알아서 어둡게 다시 칠합니다. 그러면 로고, 버튼, 브랜드 색이 디자인과 꽤 다르게 보일 수 있는데, PC 브라우저에서는 이 모습을 확인할 방법이 없습니다.

Forced Dark Preview를 쓰면 크롬에서 바로 볼 수 있습니다. 툴바 버튼을 누르면 지금 페이지를 삼성 인터넷의 강제 다크 모드처럼 다시 칠하고, 한 번 더 누르면 원래대로 돌아옵니다.

얼마나 비슷할까요? 변환 규칙은 삼성 인터넷 31.0이 설치된 실제 갤럭시 폰에서 쟀습니다. 테스트 페이지에서 요소와 색 조합의 97.2%가 폰과 일치했습니다. 크롬에 내장된 자동 다크 모드는 방식이 달라서 8.8%만 일치했습니다.

변환하는 것:
• 배경, 글자, 테두리, 외곽선, 그림자, 그라디언트를 각각 다른 밝기 범위로 변환
• 입력창과 버튼
• 인라인 SVG, SVG 이미지, 작은 어두운 아이콘을 폰과 같은 크기 규칙으로 변환
• 사진과 배경 이미지는 어둡게 처리
• 다른 사이트에서 불러온 프레임, 보안 정책(CSP)이 엄격한 페이지도 지원

참고:
• 크롬 개발자 도구의 기기 모드와 같이 쓰면 폰 크기로 볼 수 있습니다.
• 마우스를 올리거나 포커스했을 때만 바뀌는 색은 변환하지 않습니다.
• 폰이 화면을 그리는 단계를 페이지 안에서 흉내 내므로 작은 차이는 남습니다.

삼성전자와 관계없는 비공식 프로젝트입니다. 오픈소스: https://github.com/GUMBOKIM/samsung-forced-dark-mode

**Graphics:**
- Icon: `dist/extension/icons/128.png`
- Screenshots (1280×800): `store/screenshot-1.png`, `store/screenshot-2.png`
- Small promo tile (440×280): `store/promo-small.png`

## Privacy practices tab

**Single purpose:**
Repaints the current tab to preview how Samsung Internet's forced dark mode would display it, and restores the page when clicked again.

**Permission justifications:**
- `activeTab`: Runs the color conversion only in the tab where the user clicked the toolbar button.
- `scripting`: Injects the color conversion script into that tab and its frames when the button is clicked.
- Host permission (`<all_urls>`): The page's icons and SVG images often come from other domains, and their pixels cannot be read from the page because of CORS. The extension fetches those image files again, without cookies, to convert them the way the phone does. It is also needed to convert frames from other domains. Nothing runs until the user clicks the button.

**Remote code:** No. All code is included in the package.

**Data usage:** Collects none of the listed data types. Check all three certifications (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/GUMBOKIM/samsung-forced-dark-mode/blob/main/PRIVACY.md (works once the repository is public)
