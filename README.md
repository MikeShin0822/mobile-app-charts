# Mobile App Charts

공식 Apple App Store / Google Play 공개 페이지만 사용해 모바일 앱 차트를 저장하고 시각화하는 정적 웹사이트입니다.

## 추적 국가
- 대한민국 (KR)
- 미국 (US)
- 일본 (JP)
- 중국 (CN)
- 프랑스 (FR)
- 호주 (AU)
- 독일 (DE)

## 데이터 원칙
- 무료 앱 종합 TOP 25
- 제3자 차트 사이트 미사용
- 공식 공개 페이지에서 정확한 순위를 검증할 수 없으면 `unavailable`로 저장
- 스냅샷을 날짜별 JSON으로 누적
- 웹 UI에서 국가별 / 주간 / 월간 / 카테고리별 / 수집 상태를 탐색

## 현재 시험 실행
`data/2026-08-11.json`

Apple App Store는 7개국 TOP 25를 공식 차트에서 수집했습니다.
Google Play는 공식 페이지의 Top charts UI가 검색/수집 환경에서 정확한 1~25 앱 목록으로 노출되지 않아 이번 시험 실행에서는 순위를 임의 보완하지 않았습니다.

## GitHub Pages
`.github/workflows/pages.yml`이 정적 파일을 GitHub Pages로 배포합니다. 저장소 Settings → Pages에서 Source가 GitHub Actions로 활성화되어 있어야 합니다.
