# Dashboard automation instructions

정기 수집은 `.github/workflows/update-charts.yml`에서 매주 월요일 13:00 KST에 실행합니다.

1. Apple App Store 공식 Marketing Tools RSS와 Google Play 공식 `topselling_free` 컬렉션에서 7개국 무료 앱 TOP 25를 수집합니다.
2. 정확한 앱-순위 매핑을 확인하지 못한 스토어/국가는 추정하지 않고 `unavailable`로 기록합니다.
3. 각 앱에 `appId`, 공식 스토어 URL, 앱 아이콘 URL, 개발사, 카테고리를 저장합니다.
4. Google Play 앱 상세 페이지에서 카테고리·개발사·아이콘·공식 스토어 URL을 보강합니다.
5. 한국·미국 앱 제목은 스토어 원문을 유지합니다.
6. 일본·중국·프랑스·호주·독일 앱 제목은 `한글 번역(원어 제목)` 형식으로 저장하고 `data/translations.json` 캐시를 재사용합니다.
7. 게시 전 검증 단계에서 Apple 175개 + Google Play 175개, 1~25위 순위 완전성, 아이콘·공식 링크, 카테고리, 국가별 제목 형식을 검사합니다.
8. 검증을 통과한 경우에만 `data/YYYY-MM-DD.json` 스냅샷과 `data/index.json`을 `main`에 커밋합니다.
9. 대시보드는 국가별·주간·월간·카테고리별·수집 상태 화면에서 앱 아이콘을 표시하고, 앱 아이콘과 앱 제목을 공식 Apple App Store 또는 Google Play 주소에 연결합니다.
10. 대시보드 정적 파일과 `data` 폴더를 Pages 게시 브랜치인 `gh-pages`에도 반영합니다.
11. `https://mikeshin0822.github.io/mobile-app-charts/`의 Pages 빌드가 `built`인지 확인합니다.
12. `index.html`, `styles.css`, `icons.css`, `app.js`, `app-links.js`의 호환성과 기존 데이터 스키마 및 주간·월간 비교를 유지합니다.

GitHub Pages는 `gh-pages` 브랜치 루트에서 배포됩니다. 정기 워크플로가 `main`과 `gh-pages`를 함께 갱신하므로 새 데이터와 UI 변경이 같은 실행에서 공개 사이트에 반영됩니다.
