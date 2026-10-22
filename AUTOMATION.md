# Dashboard automation instructions

정기 수집은 `.github/workflows/update-charts.yml`에서 매주 월요일 13:00 KST에 실행합니다.

1. Apple App Store 공식 Marketing Tools RSS와 Google Play 공식 `topselling_free` 컬렉션에서 7개국 무료 앱 TOP 25를 수집합니다.
2. 정확한 앱-순위 매핑을 확인하지 못한 스토어/국가는 추정하지 않고 `unavailable`로 기록하며 부분 데이터와 과거 순위를 복사하지 않습니다.
3. 각 앱에 `appId`, 공식 스토어 URL, 앱 아이콘 URL, 개발사, 카테고리, 공식 짧은 설명과 각 메타데이터의 상태·출처·확인 시각을 저장합니다.
4. Apple은 공식 iTunes Lookup을 앱 ID로 조회해 RSS에서 빠진 카테고리와 App Store 설명을 보강합니다. Google Play는 공식 앱 상세 페이지에서 카테고리·개발사·아이콘·URL·짧은 설명을 보강합니다.
5. 긴 공식 설명은 생성형으로 요약하지 않고 최대 180자의 완결 문장 또는 원문 앞부분을 발췌합니다. 조회 실패 시 `공식 설명 미확인`과 구체적인 실패 사유를 기록합니다.
6. 한국·미국 앱 제목은 스토어 원문을 유지합니다.
7. 일본·중국·프랑스·호주·독일 앱 제목은 `한글 번역(원어 제목)` 형식으로 저장하고 `data/translations.json` 캐시를 재사용합니다. 번역 API 실패 원문은 성공 번역으로 캐시하지 않습니다.
8. 게시 전 검증 단계에서 각 `verified` 차트의 정확한 25개, 1~25위 순위 완전성, 앱 ID 중복, 공식 링크, 카테고리와 설명 출처, 국가별 제목 형식을 검사합니다. `unavailable` 차트는 레코드가 0개여야 합니다.
9. 검증을 통과한 경우에만 `data/YYYY-MM-DD.json` 스냅샷과 `data/index.json`을 `main`에 커밋합니다.
10. 대시보드는 국가별·주간·월간·카테고리별·수집 상태 화면에서 앱의 공식 짧은 설명을 표시하고, 앱 아이콘과 앱 제목을 공식 스토어 주소에 연결합니다.
11. 대시보드 정적 파일과 `data` 폴더를 Pages 게시 브랜치인 `gh-pages`에도 반영합니다.
12. `https://mikeshin0822.github.io/mobile-app-charts/`의 Pages 빌드 성공 여부를 확인합니다.
13. `index.html`, `styles.css`, `icons.css`, `app.js`, `app-links.js`의 호환성과 기존 데이터 스키마 및 주간·월간 비교를 유지합니다.
14. 스냅샷의 `YYYY-MM-DD` 기준일은 실행 시점의 `Asia/Seoul` 현지 날짜를 사용합니다.

GitHub Pages는 `gh-pages` 브랜치 루트에서 배포됩니다. 정기 워크플로가 `main`과 `gh-pages`를 함께 갱신하므로 새 데이터와 UI 변경이 같은 실행에서 공개 사이트에 반영됩니다.

Last metadata schema improvement: 2026-10-22 KST
