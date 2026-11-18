# samsung-forced-dark

삼성 인터넷의 강제 다크 모드를 다루는 작은 도구 두 개입니다. 런타임 의존성은 없습니다.

| 패키지 | 하는 일 |
|---|---|
| [`packages/detect`](packages/detect) | 지금 페이지에 강제 다크가 적용됐는지 알려 줍니다 |
| [`packages/emulate`](packages/emulate) | 일반 브라우저에서 페이지를 삼성 인터넷의 강제 다크처럼 보이게 합니다 |

## 시작하기

```bash
npm install
npm run demo   # http://localhost:5177
npm test
```

`npm run build`를 실행하면 `dist/`에 결과물이 생깁니다.

| 파일 | 용도 |
|---|---|
| `detect.js`, `emulate.js` | ES 모듈 |
| `detect.global.js`, `emulate.global.js` | `<script>`용. 전역 `SamsungForcedDarkDetect`, `SamsungForcedDarkEmulate` |
| `samsung-dark.auto.js` | 넣기만 하면 바로 적용되는 파일. 다시 실행하면 꺼집니다 |
| `bookmarklet.txt` | 북마크 주소에 붙여 넣는 버전 |

## 1. 강제 다크 감지

```ts
import { detectForcedDark } from './dist/detect.js';

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
<script src="samsung-dark.auto.js"></script>
```

개발자 도구 콘솔에 `samsung-dark.auto.js`의 내용을 붙여 넣거나, `bookmarklet.txt`를 북마크로 등록해도 됩니다. 한 번 더 실행하면 원래대로 돌아옵니다.

코드에서 제어할 수도 있습니다.

```ts
import { emulateForcedDark } from './dist/emulate.js';

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

### 변환 규칙

색을 Y′CbCr(BT.601)로 바꾼 뒤 밝기 Y만 대상별 범위로 옮깁니다. 공식은 Daniel Aleksandersen의 [Samsung Internet 11 분석](https://www.ctrl.blog/entry/samsung-internet-night-mode/)을 따랐고, 범위는 삼성 인터넷 31.0에서 다시 쟀습니다.

```
m  = (invert && y < 0.85) ? 1 - y : y
y' = min + m × (max - min)
```

| 대상 | 범위 |
|---|---|
| 일반 배경, 문서 배경 | 0.004 ~ 0.12 |
| `input`, `textarea` 배경 | 0.067 ~ 0.165 |
| `button`, `select` 배경 | 0.15 ~ 0.29 |
| 그라디언트 | 0.02 ~ 0.12 |
| 테두리 | 0.27 ~ 0.33 |
| 외곽선 | 0.14 ~ 0.20 |
| 그림자 | 0.28 ~ 0.33 |
| SVG | 0.50 ~ 0.70 |
| 글자 (뒤집기) | 0.29 ~ 1.00 |
| `<img>` | 모든 채널 × 0.7 |
| CSS 배경 이미지 | 모든 채널 × 0.5 |
| `canvas` | 변환 없음 |

가로세로가 모두 20px 이하인 박스의 배경은 글자처럼 뒤집습니다.

## 검증한 범위

- **색 변환:** 삼성 인터넷 31.0에서 잰 회색 256단계, 대상 11가지의 값과 모두 ±1 안에서 일치합니다(`npm test`).
- **감지:** SM-S931N, 삼성 인터넷 31.0.0.81에서 강제 다크가 켜진 상태를 `forced`, 값 179로 판별했습니다. 강제 다크가 꺼진 실기기 상태는 시험하지 않았고, 단위 테스트로만 확인했습니다.
- **페이지 변환:** Chromium에서 데모 페이지로 변환, 동적 콘텐츠 반영, 원래 스타일 복원을 확인했습니다.

## 한계

- 페이지가 그리는 단계를 바꿀 수 없어 DOM에서 흉내 냅니다. 실제 삼성 인터넷과 픽셀까지 같지는 않습니다.
- `:hover`, `:focus`로 바뀌는 색은 반영되지 않습니다.
- `<img>`로 넣은 SVG는 비트맵처럼 0.7배만 어두워집니다. 실제로는 밝기 범위가 옮겨집니다.
- 비트맵 CSS 배경은 반투명 검정을 덮어 어둡게 하므로 투명한 부분도 함께 어두워집니다.
- `iframe` 내부, 닫힌 Shadow DOM, 동영상은 변환하지 않습니다.
- 유채색 비트맵은 실제 결과와 채널당 최대 20까지 다를 수 있습니다.
- 콘텐츠 보안 정책(CSP)이 엄격한 사이트에서는 북마크릿이 막힐 수 있습니다.
- 삼성 인터넷이 업데이트로 동작을 바꾸면 값과 감지 방법이 달라질 수 있습니다.
