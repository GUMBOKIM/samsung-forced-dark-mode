# samsung-forced-dark-mode

[English](README.md) | **한국어**

삼성 인터넷의 강제 다크 모드를 감지하고 다른 브라우저에서 똑같이 재현하는 비공식 라이브러리입니다. 런타임 의존성은 없습니다. 삼성전자와는 관계가 없습니다.

| 패키지 | 하는 일 |
|---|---|
| [`packages/detect`](packages/detect) | 지금 페이지에 강제 다크가 적용됐는지 알려 줍니다 |
| [`packages/emulate`](packages/emulate) | 일반 브라우저에서 페이지를 삼성 인터넷의 강제 다크처럼 보이게 합니다 |

## 설치

```bash
npm install samsung-forced-dark-mode
```

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';
// 한 번에: import { detectForcedDark, emulateForcedDark } from 'samsung-forced-dark-mode';
```

타입 선언이 같이 들어 있습니다. 번들러 없이 쓸 때는 아래 파일을 `https://unpkg.com/samsung-forced-dark-mode/dist/<파일>` 같은 CDN 주소로 바로 불러와도 됩니다.

| 파일 | 용도 |
|---|---|
| `detect.js`, `emulate.js`, `index.js` | ES 모듈 |
| `detect.d.ts`, `emulate.d.ts`, `index.d.ts` | 타입 선언 |
| `detect.ts`, `emulate.ts` | 프로젝트에 복사해서 쓰는 TypeScript 단일 파일 |
| `detect.global.js`, `emulate.global.js` | `<script>`용. 전역 `SamsungForcedDarkDetect`, `SamsungForcedDarkEmulate` |
| `samsung-forced-dark-mode.auto.js` | 넣기만 하면 바로 적용되는 파일. 다시 실행하면 꺼집니다 |
| `bookmarklet.txt` | 북마크 주소에 붙여 넣는 버전 |

## 개발

```bash
npm install
npm run demo   # http://localhost:5177
npm test
npm run build  # 위 파일을 모두 dist/에 만듭니다
```

## 1. 강제 다크 감지

```ts
import { detectForcedDark } from 'samsung-forced-dark-mode/detect';

const { state, forced, sample } = await detectForcedDark();

if (forced) {
  // 예: "메뉴(≡) → 밝게 보기"를 안내합니다
}
```

| `state` | 뜻 |
|---|---|
| `forced` | 삼성 인터넷이 강제 다크를 적용하고 있습니다 |
| `not-forced` | 삼성 인터넷이지만 강제 다크가 꺼져 있습니다 |
| `not-samsung` | 삼성 인터넷이 아닙니다 |
| `unknown` | 삼성 인터넷이지만 값을 읽지 못했습니다 |

강제 다크가 켜져 있어도 `prefers-color-scheme`은 `light`이고 `getComputedStyle`은 원래 색을 돌려줍니다. 대신 흰색 SVG 이미지를 canvas에 그려 읽으면 255가 아니라 179가 나오는 것을 이용합니다.

## 2. 삼성 인터넷처럼 보이게 하기

페이지에 넣기만 하면 됩니다.

```html
<script src="https://unpkg.com/samsung-forced-dark-mode/dist/samsung-forced-dark-mode.auto.js"></script>
```

개발자 도구 콘솔에 `samsung-forced-dark-mode.auto.js`의 내용을 붙여 넣거나, `bookmarklet.txt`를 북마크로 등록해도 됩니다. 한 번 더 실행하면 원래대로 돌아옵니다.

코드에서 제어할 수도 있습니다.

```ts
import { emulateForcedDark } from 'samsung-forced-dark-mode/emulate';

const emulation = emulateForcedDark();

emulation.refresh(); // 바로 다시 변환
emulation.stop();    // 페이지가 가지고 있던 스타일로 복원
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `root` | 문서 전체 | 변환할 범위 |
| `observe` | `true` | 나중에 추가되거나 바뀐 내용도 변환 |
| `minIntervalMs` | `200` | 페이지가 계속 바뀔 때 변환 사이의 최소 간격 |

변환하지 않을 요소에는 `data-sfd-ignore` 속성을 붙입니다.

### 크롬 확장 프로그램

같은 기능을 크롬 확장 프로그램으로도 쓸 수 있습니다. 툴바 버튼을 누르면 지금 탭에서 켜지고, 한 번 더 누르면 꺼집니다.

```bash
npm run extension   # dist/extension 폴더와 크롬 웹 스토어용 dist/extension.zip 생성
```

`chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**로 `dist/extension`을 불러오면 됩니다.

확장 프로그램으로 쓰면 스크립트 방식의 한계 몇 가지가 사라집니다.

- 다른 출처의 이미지를 확장 프로그램이 대신 받아 오므로 어느 사이트에서나 아이콘 규칙과 SVG 도형별 변환이 적용됩니다. 이 요청에는 쿠키를 싣지 않습니다.
- 콘텐츠 보안 정책(CSP)이 엄격한 페이지에서도 동작합니다.
- 다른 출처의 `iframe` 안도 변환합니다.

### 변환 규칙

색을 Y′CbCr(BT.601)로 바꾼 뒤 밝기 Y만 대상별 범위로 옮깁니다. 공식은 Daniel Aleksandersen의 [Samsung Internet 11 분석](https://www.ctrl.blog/entry/samsung-internet-night-mode/)을 따랐고 범위는 삼성 인터넷 31.0에서 다시 쟀습니다.

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
| `<img>` | 모든 채널 × 0.7 |
| CSS 배경 이미지 | 모든 채널 × 0.5 |
| `canvas` | 변환 없음 |

그 밖의 규칙입니다.

- 배경이 아예 없는 페이지는 `rgb(1, 1, 1)`로 칠합니다.
- 가로세로가 모두 20px 이하인 박스의 배경은 글자처럼 뒤집습니다.
- `<img>`와 CSS 배경으로 넣은 SVG도 인라인 SVG와 같은 규칙으로 도형마다 변환합니다.
- 가로세로가 모두 90px 이하이고 불투명한 픽셀이 79% 이하이며 보이는 픽셀이 모두 어두운 비트맵은 아이콘으로 보고 모든 채널에 115를 더합니다.

## 검증한 범위

SM-S931N의 삼성 인터넷 31.0.0.81과 같은 기기의 Chrome 157을 비교했습니다. 일치 기준은 픽셀의 채널별 오차 10 이내입니다.

- **색 변환:** 삼성 인터넷 31.0에서 잰 회색 256단계, 대상 11가지의 값과 모두 ±1 안에서 일치합니다(`npm test`).
- **감지:** 강제 다크가 켜진 상태를 `forced`, 값 179로 판별했습니다. 강제 다크가 꺼진 실기기 상태는 시험하지 않았고 단위 테스트로만 확인했습니다.
- **요소별 비교:** 요소 종류와 색을 조합한 285칸 중 277칸(97.2%)이 일치했습니다.
- **실제 기사 페이지:** BBC, CNN, 네이버 뉴스, 아마존 등 13곳의 기사나 상품 페이지에서 평균 97.2%가 일치했습니다. 13곳 중 8곳은 99% 이상, 10곳은 97% 이상이고 가장 낮은 곳은 78.3%입니다.

기사 페이지는 두 브라우저에 같은 내용이 뜨도록 이미지, 글꼴, CSS까지 로컬에 복사해 고정한 뒤 비교했습니다. 스크립트 동작과 `iframe`, 동영상, `canvas`는 이 비교에 들어가지 않았습니다. 복사하지 않은 실제 사이트에서는 일치율이 더 낮을 수 있습니다.

## 한계

- 페이지가 그리는 단계를 바꿀 수 없어 DOM에서 흉내 냅니다. 실제 삼성 인터넷과 픽셀까지 같지는 않습니다.
- `:hover`, `:focus`로 바뀌는 색은 반영되지 않습니다.
- 스크립트 방식에서는 CORS로 막힌 외부 이미지의 픽셀을 읽을 수 없어 아이콘 규칙이 적용되지 않습니다. 이런 SVG 이미지는 도형별 크기 규칙 없이 필터로 한꺼번에 변환합니다.
- 색이 여러 개인 그라디언트는 실제보다 밝게 나올 수 있습니다.
- 닫힌 Shadow DOM과 동영상은 변환하지 않습니다. 스크립트 방식에서는 `iframe` 안도 변환하지 않습니다.
- Chrome에서만 시험했습니다. 다른 브라우저에서는 결과가 다를 수 있습니다.
- 콘텐츠 보안 정책(CSP)이 엄격한 사이트에서는 북마크릿이 막힐 수 있습니다. 확장 프로그램은 영향을 받지 않습니다.
- 삼성 인터넷이 업데이트로 동작을 바꾸면 값과 감지 방법이 달라질 수 있습니다.
