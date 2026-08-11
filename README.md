# Mobile App Charts

한국·미국·일본·중국·프랑스·호주·독일의 Apple App Store와 Google Play 공식 모바일 앱 차트를 저장하고 비교하는 정적 대시보드입니다.

## Live dashboard

- https://mikeshin0822.github.io/mobile-app-charts/

## Current collection

- 7개국 × Apple App Store 무료 앱 TOP 25 = 175개
- 7개국 × Google Play 무료 앱 TOP 25 = 175개
- 한 번의 주간 스냅샷에 총 350개 순위 항목
- Google Play 앱 상세 페이지에서 카테고리·개발사·아이콘·스토어 URL 보강
- 한국·미국: 스토어 원문 제목
- 일본·중국·프랑스·호주·독일: `한글 번역(원어 제목)` 형식

## Dashboard views

- **국가별:** 국가·스토어·카테고리별 TOP 25
- **주간:** 이전 스냅샷 대비 등락과 신규·재진입
- **월간:** 월평균 순위와 노출 횟수
- **카테고리:** 7개국 TOP 25의 카테고리 점유율
- **수집 상태:** 국가·스토어별 공식 소스 검증 현황

## Data policy

- Apple App Store 공식 Marketing Tools RSS와 Google Play 공식 Top Free 컬렉션에서 수집
- 무료 앱 종합 TOP 25
- 제3자 순위 데이터셋 미사용
- 정확한 앱-순위 매핑을 검증할 수 없으면 `unavailable`로 저장
- 날짜별 `data/YYYY-MM-DD.json` 스냅샷과 번역 캐시 누적

## Schedule and publishing

`.github/workflows/update-charts.yml`이 매주 월요일 13:00 KST에 실행됩니다. 새 스냅샷을 `main`에 커밋하고, 대시보드와 데이터를 `gh-pages` 브랜치에 게시해 공개 주소를 갱신합니다.
