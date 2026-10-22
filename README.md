# Mobile App Charts

한국·미국·일본·중국·프랑스·호주·독일의 Apple App Store와 Google Play 공식 모바일 앱 및 무료 게임 차트를 저장하고 비교하는 정적 대시보드입니다.

## Live dashboards

- 종합 앱 차트: https://mikeshin0822.github.io/mobile-app-charts/
- 무료 게임 차트: https://mikeshin0822.github.io/mobile-app-charts/games.html

## Current collection

### 종합 앱

- 7개국 × Apple App Store 무료 앱 TOP 25 = 최대 175개
- 7개국 × Google Play 무료 앱 TOP 25 = 최대 175개
- `data/YYYY-MM-DD.json`과 `data/index.json`에 누적

### 무료 게임

- 7개국 × Apple App Store 무료 게임 TOP 25 = 최대 175개
- 7개국 × Google Play 무료 게임 TOP 25 = 최대 175개
- `data/games/YYYY-MM-DD.json`과 `data/games/index.json`에 별도 누적
- Apple 공식 카테고리 필터 RSS의 Games 장르(6014)와 Google Play 공식 `TOP_FREE + GAME` 컬렉션 사용

각 앱·게임에는 안정적인 스토어 ID, 순위, 제목, 공식 설명 발췌, 개발사, 카테고리/장르, 아이콘, 공식 스토어 URL과 메타데이터 품질 상태를 저장합니다.

- 한국·미국: 스토어 원문 제목
- 일본·중국·프랑스·호주·독일: `한글 번역(원어 제목)` 형식
- 제목과 아이콘을 누르면 공식 Apple App Store 또는 Google Play 상세 페이지 열기

## Dashboard views

두 대시보드는 다음 보기를 제공합니다.

- **국가별:** 국가·스토어·카테고리/장르별 TOP 25
- **주간:** 이전 스냅샷 대비 등락과 신규·재진입
- **월간:** 월평균 순위와 노출 횟수
- **카테고리/장르:** 7개국 TOP 25의 구성
- **수집 상태:** 국가·스토어별 공식 소스와 상세정보 검증 현황

## Data policy

- Apple App Store 공식 Marketing Tools RSS, Apple 공식 카테고리 필터 RSS 및 공식 iTunes Lookup 사용
- Google Play 공식 차트/컬렉션과 공식 앱 상세 페이지 사용
- 제3자 순위 데이터셋 미사용
- 정확한 앱·게임과 순위의 1~25위 매핑을 검증할 수 없으면 해당 국가/스토어를 `unavailable`로 저장
- 부분 순위, 추정값, 지난주 순위 복사 금지
- 공식 상세설명은 생성형으로 요약하지 않고 완결 문장 또는 원문 앞 180자만 발췌
- 상세정보를 확인하지 못한 값은 명시적인 `unavailable` 상태와 실패 사유로 기록

## Validation

게시 전 다음을 검사합니다.

- verified 차트별 정확한 1~25위와 중복 없는 안정적 앱 ID
- Apple/Google 공식 차트 및 상세 페이지 도메인·국가·앱 ID 일치
- 아이콘·제목·카테고리·설명·출처·확인 시각
- 국가별 제목 표시 형식
- 카테고리/장르 구성 합계
- index coverage와 실제 verified 차트 수 일치
- unavailable 차트에 부분 레코드가 남아 있지 않음

명령어:

- 전체 회귀 테스트: `npm test`
- 앱 스냅샷 검증: `npm run validate -- YYYY-MM-DD`
- 게임 스냅샷 검증: `npm run validate:games -- YYYY-MM-DD`
- 앱만 수집: `npm run collect:apps`
- 게임만 수집: `npm run collect:games`
- 앱과 게임 전체 수집: `npm run collect`

## Schedule and publishing

`.github/workflows/update-charts.yml`이 매주 월요일 13:00 KST에 실행됩니다. 앱·게임 차트 수집, 공식 상세정보 보강, 회귀 테스트와 검증을 통과한 뒤 스냅샷을 `main`에 커밋하고 두 대시보드와 데이터를 `gh-pages`에 게시합니다.
