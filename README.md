# Mobile App Charts

한국·미국·일본·중국·프랑스·호주·독일의 공식 모바일 앱 차트를 저장하고 비교하는 정적 대시보드입니다.

## Live dashboard

- https://mikeshin0822.github.io/mobile-app-charts/

## Dashboard views

- **국가별:** 국가·스토어·카테고리별 TOP 25
- **주간:** 이전 스냅샷 대비 등락과 신규·재진입
- **월간:** 월평균 순위와 노출 횟수
- **카테고리:** 7개국 TOP 25의 카테고리 점유율
- **수집 상태:** 국가·스토어별 공식 소스 검증 현황

## Data policy

- Apple App Store와 Google Play의 공식 공개 페이지만 사용
- 무료 앱 종합 TOP 25
- 제3자 순위 사이트 미사용
- 정확한 앱-순위 매핑을 검증할 수 없으면 `unavailable`로 저장
- 날짜별 `data/YYYY-MM-DD.json` 스냅샷 누적

## Publishing

GitHub Pages는 저장소의 `gh-pages` 브랜치 루트에서 배포됩니다. 정적 사이트나 데이터가 갱신되면 `main`의 최신 배포 커밋을 `gh-pages`에도 반영해 공개 주소를 갱신합니다.
