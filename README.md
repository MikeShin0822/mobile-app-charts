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

## GitHub Pages

정적 사이트는 `.github/workflows/pages.yml`로 배포합니다. 최초 한 번 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택해야 합니다. 이후 `main` 브랜치가 갱신될 때 자동 배포됩니다.
