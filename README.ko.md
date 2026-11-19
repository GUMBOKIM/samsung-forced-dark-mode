# samsung-forced-dark-mode

[English](README.md) | **한국어**

삼성 인터넷의 강제 다크 모드를 감지하고, 다른 브라우저에서 흉내 내는 비공식 라이브러리입니다. 런타임 의존성은 없습니다. 삼성전자와는 관계가 없습니다.

| 불러오는 경로 | 하는 일 |
|---|---|
| `samsung-forced-dark-mode/detect` | 지금 페이지에 강제 다크가 적용됐는지 알려 줍니다 |
| `samsung-forced-dark-mode/emulate` | 일반 브라우저에서 페이지를 삼성 인터넷의 강제 다크처럼 보이게 합니다 |
| `samsung-forced-dark-mode` | 위 두 가지 모두 |

## 설치

```bash
npm install samsung-forced-dark-mode
```

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';
// 한 번에: import { detectForcedDark, emulateForcedDark } from 'samsung-forced-dark-mode';
```

타입 선언이 같이 들어 있습니다. 번들러 없이 쓸 때는 `https://unpkg.com/samsung-forced-dark-mode@0.1.1/dist/<파일>` 같은 CDN 주소로 불러오면 됩니다.

| `dist/`의 파일 | 용도 |
|---|---|
| `detect.js`, `emulate.js`, `index.js` | ES 모듈 |
| `detect.d.ts`, `emulate.d.ts`, `index.d.ts` | 타입 선언 |
| `detect.ts`, `emulate.ts` | 프로젝트에 복사해서 쓰는 TypeScript 단일 파일 |
| `detect.global.js`, `emulate.global.js` | `<script>`용. 전역 `SamsungForcedDarkDetect`, `SamsungForcedDarkEmulate`를 만듭니다 |
| `samsung-forced-dark-mode.auto.js` | 불러오면 켜지고, 다시 실행하면 꺼집니다 |
| `bookmarklet.txt` | 북마크 주소에 붙여 넣는 버전 |

## 1. 강제 다크 감지

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';

const { state, forced, samsungBrowser, version, sample } = await detectForcedDark();

if (forced) {
  // 예: "메뉴(≡) → 밝게 보기"를 안내합니다
}
```

| `state` | 뜻 |
|---|---|
| `forced` | 삼성 인터넷이고, 측정값이 기준보다 낮게 나왔습니다. 강제 다크가 켜져 있습니다 |
| `not-forced` | 삼성 인터넷이지만 강제 다크 신호를 찾지 못했습니다 |
| `not-samsung` | 삼성 인터넷이 아닙니다 |
| `unknown` | 삼성 인터넷이지만 값을 읽지 못했습니다 |

`sample`은 흰색 SVG 이미지를 읽은 빨강 채널 값이고 읽지 못하면 `null`입니다. `version`은 user agent에 적힌 삼성 인터넷 버전(예: `"31.0"`)입니다.

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `threshold` | `250` | 측정값이 이보다 낮으면 강제 다크로 봅니다 |
| `timeoutMs` | `2000` | 이 시간이 지나면 포기하고 `unknown`을 돌려줍니다 |
| `userAgent` | `navigator.userAgent` | 검사할 user agent |

강제 다크가 켜져 있어도 `prefers-color-scheme`은 `light`이고 `getComputedStyle`은 원래 색을 돌려줍니다. 대신 흰색 SVG 이미지를 canvas에 그려 읽으면 255가 아니라 179가 나오는 것을 이용합니다.

직접 모은 값으로 같은 판정을 하고 싶다면 `classify(userAgent, sample, threshold?)`와 `samsungVersion(userAgent)`도 쓸 수 있습니다.

## 2. 삼성 인터넷처럼 보이게 하기

페이지에 넣기만 하면 됩니다.

```html
<script src="https://unpkg.com/samsung-forced-dark-mode@0.1.1/dist/samsung-forced-dark-mode.auto.js"></script>
```

번들러를 쓴다면 `import 'samsung-forced-dark-mode/auto';`로도 같은 일을 합니다. 이 스크립트는 먼저 감지를 돌리고, 삼성 인터넷이 이미 강제 다크를 적용 중이면 두 번 변환하지 않도록 콘솔 경고만 남깁니다.

개발자 도구 콘솔에 `samsung-forced-dark-mode.auto.js`의 내용을 붙여 넣거나, `bookmarklet.txt`를 북마크로 등록해도 됩니다. 한 번 더 실행하면 원래대로 돌아옵니다.

코드에서 제어할 수도 있습니다.

```ts
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';

const emulation = emulateForcedDark();

emulation.refresh(); // 바로 다시 변환
emulation.stop();    // 페이지가 가지고 있던 스타일로 복원
emulation.active;    // stop() 뒤에는 false
```

`<script>`용 빌드에서는 같은 함수가 전역 객체에 들어 있습니다.

```html
<script src="https://unpkg.com/samsung-forced-dark-mode@0.1.1/dist/emulate.global.js"></script>
<script>
  const emulation = SamsungForcedDarkEmulate.emulateForcedDark();
</script>
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `root` | 문서 전체 | 변환할 범위 |
| `observe` | `true` | 나중에 추가되거나 바뀐 내용도 변환 |
| `minIntervalMs` | `200` | 페이지가 계속 바뀔 때 변환 사이의 최소 간격 |
| `loadResource` | 없음 | `(url) => Promise<Blob \| null>`. CORS가 없는 외부 이미지처럼 페이지가 직접 읽지 못하는 이미지를 대신 받아 옵니다 |

변환은 한 번에 하나만 돕니다. 이미 켜져 있을 때 `emulateForcedDark()`를 다시 부르면 새 옵션은 무시하고 켜져 있는 것을 돌려줍니다.

요소에 `data-sfd-ignore` 속성을 붙이면 그 요소와 안쪽 요소 전부를 변환하지 않습니다.

색 변환만 따로 쓸 수도 있습니다. `convert(rgb, role)`은 그리는 대상별로 바뀐 색을, `luma(rgb)`는 BT.601 밝기를 돌려주고, `rewriteColors(css, role)`은 CSS 값 안의 색을 모두 바꿉니다.

### 크롬 확장 프로그램

같은 변환기를 크롬 확장 프로그램으로도 쓸 수 있습니다. 툴바 버튼을 누를 때마다 지금 탭에서 켜지고 꺼집니다. 아직 크롬 웹 스토어에 없고 npm 패키지에도 들어 있지 않아서, 이 저장소에서 직접 빌드해야 합니다(Node.js 22.18 이상).

```bash
git clone https://github.com/GUMBOKIM/samsung-forced-dark-mode.git
cd samsung-forced-dark-mode
npm install
npm run extension   # dist/extension 폴더와 크롬 웹 스토어용 dist/extension.zip 생성
```

`chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**로 `dist/extension`을 불러오면 됩니다.

확장으로 쓰면 스크립트 버전의 한계 몇 가지가 사라집니다.

- 다른 도메인의 이미지를 확장이 직접 받아 오므로 대부분의 사이트에서 아이콘 규칙과 SVG 도형별 변환이 적용됩니다. 8MB 이하의 `http(s)` 이미지만 받고, 쿠키는 보내지 않습니다. 다만 페이지의 콘텐츠 보안 정책이 `data:` 이미지를 막으면 바꾼 이미지가 보이지 않을 수 있습니다.
- 확장이 스크립트를 넣기 때문에 콘텐츠 보안 정책(CSP)이 엄격해도 실행됩니다.
- 다른 도메인의 `iframe`도 변환합니다.

### 변환 규칙

색을 Y′CbCr(BT.601)로 바꾼 뒤 밝기 Y만 대상별 범위로 옮깁니다. 공식은 Daniel Aleksandersen의 [Samsung Internet 11 분석](https://www.ctrl.blog/entry/samsung-internet-night-mode/)을 바탕으로 했습니다. 원래 글에서는 밝기가 0.85 이상이면 변환하지 않았지만 삼성 인터넷 31.0에서는 흰 배경도 바뀌기 때문에, 여기서는 0.85가 밝기를 뒤집을지만 정하도록 고쳤습니다. 범위는 삼성 인터넷 31.0에서 다시 쟀습니다.

```
m  = (invert && y < 0.85) ? 1 - y : y
y' = min + m × (max - min)
```

| 대상 | 범위 |
|---|---|
| `<html>` 배경, `<html>`에 배경이 없을 때의 `<body>` 배경 | 0.004 ~ 0.08 |
| 일반 배경 | 0.004 ~ 0.12 |
| `input`, `textarea` 배경 | 0.067 ~ 0.165 |
| `button`, `select` 배경 | 0.15 ~ 0.29 |
| 그라디언트 | 0.02 ~ 0.12 |
| 테두리 | 0.27 ~ 0.33 |
| 외곽선 | 0.14 ~ 0.20 |
| 그림자 | 0.28 ~ 0.33 |
| SVG 도형 | 0.50 ~ 0.70 |
| 가로세로 모두 20px 미만인 SVG 도형 (뒤집기) | 0.50 ~ 0.70 |
| 한 변이 90px 이상인 SVG `rect`, `circle`, `ellipse` | 0.15 ~ 0.29 |
| 글자 (뒤집기) | 0.29 ~ 1.00 |
| `<img>` 비트맵 | 모든 채널 × 약 0.7 |
| CSS 배경 비트맵 | 모든 채널 × 약 0.5 |
| `canvas` | 변환 없음 |

비트맵 배율은 단색 회색·유채색 이미지로 쟀고, 실제 사진은 재지 않았습니다.

그 밖의 규칙은 다음과 같습니다.

- 배경이 아예 없는 페이지는 `rgb(1, 1, 1)`로 칠합니다.
- 가로세로가 모두 20px 이하인 박스의 배경은 글자 범위로 뒤집어 바꿉니다. 폼 컨트롤과 페이지 전체 배경은 제외입니다. 박스는 20px까지 포함하고, SVG 도형은 20px 미만이어야 합니다.
- `<img>`와 CSS 배경으로 넣은 SVG도 인라인 SVG와 같은 규칙으로 도형마다 변환합니다.
- 화면에 그려지는 크기가 가로세로 모두 90px 이하이고, 완전히 투명하지 않은 픽셀이 79% 이하이고, 보이는 픽셀이 모두 어두운(회색 계열은 밝기 약 0.5 미만, 유채색은 약 0.29 미만) 비트맵은 아이콘으로 보고 모든 채널에 115를 더합니다. 경곗값은 시험 이미지로 좁혀 찾은 근삿값입니다. `<img>`는 원본이 512px보다 크면 검사하지 않습니다.

## 검증한 범위

SM-S931N의 삼성 인터넷 31.0.0.81과, 이 라이브러리를 돌린 크롬을 비교했습니다. 일치 기준은 픽셀의 채널별 오차가 10 이내인 것입니다.

- **색 변환:** 삼성 인터넷 31.0에서 잰 회색 256단계, 대상 11가지, 모두 2,816개 값과 ±1 안에서 일치합니다(`npm test`). 페이지 전체 배경 범위와 작은 SVG 도형 규칙은 따로 쟀습니다.
- **감지:** 강제 다크가 켜진 상태를 `forced`, 값 179로 판별했습니다. 강제 다크가 꺼진 실기기 상태는 시험하지 않았고, 단위 테스트로만 확인했습니다.
- **요소별 비교:** 요소 종류와 색을 조합한 285칸 중 277칸(97.2%)이 일치했습니다.
- **실제 페이지:** BBC, CNN, 네이버 뉴스, 아마존 등 13곳의 기사나 상품 페이지에서 픽셀의 평균 97.2%가 일치했습니다. 13곳 중 8곳은 99% 이상, 10곳은 97% 이상이고, 가장 낮은 곳은 78.3%입니다.

두 브라우저에 같은 내용이 뜨도록 페이지를 이미지, 글꼴, CSS까지 로컬에 복사해 고정한 뒤 비교했습니다. 스크립트 동작과 `iframe`, 동영상, `canvas`는 이 비교에 들어가지 않았습니다. 복사하지 않은 실제 사이트에서는 일치율이 더 낮을 수 있습니다.

## 한계

- 페이지에서는 브라우저의 페인트 단계를 바꿀 수 없어 DOM에서 흉내 냅니다. 실제 삼성 인터넷과 픽셀까지 같지는 않습니다.
- `:hover`, `:focus`로 바뀌는 색은 반영되지 않고, 변환된 기본 색이 그대로 남습니다.
- 스크립트 버전에서는 CORS로 막힌 외부 이미지의 픽셀을 읽을 수 없어 아이콘 규칙이 적용되지 않습니다. 이런 SVG 이미지는 도형별 크기 규칙 없이 필터로 한꺼번에 변환합니다.
- 색이 여러 개인 그라디언트는 실제보다 밝게 나올 수 있습니다.
- 닫힌 Shadow DOM과 동영상은 변환하지 않습니다. 스크립트 버전에서는 `iframe` 내부도 변환하지 않습니다.
- Chrome에서만 시험했습니다. 다른 브라우저에서는 결과가 다를 수 있습니다.
- 콘텐츠 보안 정책(CSP)이 엄격한 사이트에서는 북마크릿과 CDN 스크립트 태그가 막힐 수 있습니다. 확장 프로그램은 영향을 받지 않습니다.
- 감지는 삼성 인터넷 31.0의 기본 웹페이지 밝기에서만 쟀습니다. 29 이하 버전과 다른 밝기 설정은 확인하지 않았습니다.
- 삼성 인터넷이 업데이트로 동작을 바꾸면 값과 감지 방법이 달라질 수 있습니다.

## 개발

Node.js 22.18 이상이 필요합니다.

```bash
git clone https://github.com/GUMBOKIM/samsung-forced-dark-mode.git
cd samsung-forced-dark-mode
npm install
npm run demo   # http://localhost:5177
npm test
npm run build  # 위 파일을 모두 dist/에 만듭니다
```
