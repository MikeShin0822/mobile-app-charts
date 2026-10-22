# Mobile App Charts

한국·미국·일본·중국·프랑스·호주·독일의 Apple App Store와 Google Play 공식 모바일 앱 차트를 저장하고 비교하는 정적 대시보드입니다.

## Live dashboard

- https://mikeshin0822.github.io/mobile-app-charts/

## Current collection

- 7개국 × Apple App Store 무료 앱 TOP 25 = 최대 175개
- 7개국 × Google Play 무료 앱 TOP 25 = 최대 175개
- 모든 국가·스토어가 검증되면 한 번의 주간 스냅샷에 총 350개 순위 항목
- 각 앱의 아이콘, 개발사, 카테고리, 공식 스토어 URL, 공식 상세정보에서 가져온 짧은 설명 저장
- 한국·미국: 스토어 원문 제목
- 일본·중국·프랑스·호주·독일: `한글 번역(원어 제목)` 형식
- 앱 아이콘과 앱 제목을 눌러 공식 Apple App Store 또는 Google Play 페이지 열기

## Dashboard views

- **국가별:** 국가·스토어·카테고리별 TOP 25
- **주간:** 이전 스냅샷 대비 등락과 신규·재진입
- **월간:** 월평균 순위와 노출 횟수
- **카테고리:** 7개국 TOP 25의 카테고리 점유율
- **수집 상태:** 국가·스토어별 공식 소스 검증 현황

## Data policy

- 순위는 Apple App Store 공식 Marketing Tools RSS와 Google Play 공식 Top Free 컬렉션에서만 수집
- 무료 앱 종합 TOP 25
- 제3자 순위 데이터셋 미사용
- 정확한 앱-순위 매핑을 검증할 수 없으면 해당 국가·스토어를 `unavailable`로 저장하고 부분 순위나 과거 순위를 복사하지 않음
- Apple 카테고리와 설명은 공식 iTunes Lookup/App Store 정보로, Google 카테고리와 설명은 공식 Google Play 앱 상세 페이지로 보강
- 긴 공식 설명은 원문 순서를 유지한 최대 180자의 문장/앞부분 발췌로 저장하며 별도의 생성형 요약을 만들지 않음
- 공식 상세정보에서 설명을 확인하지 못하면 `descriptionStatus: unavailable`과 실패 사유를 남기고 문구를 추정하지 않음
- 날짜별 `data/YYYY-MM-DD.json` 스냅샷과 번역 캐시 누적
- 게시 전 각 `verified` 차트의 정확한 25개·1~25위·안정적 앱 ID·공식 URL·카테고리·설명 출처·제목 형식을 검증

## Schedule and publishing

`.github/workflows/update-charts.yml`이 매주 월요일 13:00 KST에 실행됩니다. 수집·번역·공식 상세정보 보강·검증 후 새 스냅샷을 `main`에 커밋하고, UI와 데이터를 `gh-pages` 브랜치에 게시해 공개 주소를 갱신합니다.

## Apple category quality

Apple RSS에서 카테고리가 비어 있으면 해당 국가의 공식 iTunes Lookup에서 앱 ID로 보강합니다. 확인하지 못한 값은 `기타`로 추정하지 않고 `미확인`으로 기록합니다. 기존 순위 검증 상태와 별도로 `categoryStatus` 및 소스별 `categoryQuality`에 품질·출처·확인 시각을 남깁니다.

## Official description quality

Apple은 국가별 공식 iTunes Lookup의 `description`, Google Play는 공식 앱 상세 페이지의 `summary` 또는 `description`을 사용합니다. 각 레코드에 `descriptionStatus`, `descriptionSource`, `descriptionCheckedAt`, `descriptionReason`을 저장하고, 국가·스토어 소스에는 `descriptionQuality` 집계를 남깁니다. 상세정보 조회 실패는 차트 순위를 폐기하지 않지만 명시적인 `unavailable` 설명으로 기록됩니다.

- 회귀 테스트: `npm test`
- 특정 날짜 검증: `npm run validate -- 2026-10-22`
- [Apple 카테고리 원인 조사와 보강 정책](docs/apple-category-investigation.md)
