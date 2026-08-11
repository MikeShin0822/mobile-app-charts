# Dashboard automation instructions

정기 수집은 `.github/workflows/update-charts.yml`에서 매주 월요일 13:00 KST에 실행합니다.

1. Apple App Store 공식 Marketing Tools RSS와 Google Play 공식 `topselling_free` 컬렉션에서 7개국 무료 앱 TOP 25를 수집합니다.
2. 정확한 앱-순위 매핑을 확인하지 못한 스토어/국가는 추정하지 않고 `unavailable`로 기록합니다.
3. Google Play 앱 상세 페이지에서 카테고리·개발사·아이콘·스토어 URL을 보강합니다.
4. 한국·미국 앱 제목은 스토어 원문을 유지합니다.
5. 일본·중국·프랑스·호주·독일 앱 제목은 `한글 번역(원어 제목)` 형식으로 저장하고 `data/translations.json` 캐시를 재사용합니다.
6. `data/YYYY-MM-DD.json` 스냅샷을 추가하고 `data/index.json`에 날짜와 Apple/Google 국가 커버리지를 등록합니다.
7. 앱 ID와 제목 표기를 이전 스냅샷과 최대한 일관되게 유지합니다.
8. 데이터를 `main`에 커밋한 뒤 대시보드 정적 파일과 `data` 폴더를 Pages 게시 브랜치인 `gh-pages`에도 반영합니다.
9. `https://mikeshin0822.github.io/mobile-app-charts/`의 Pages 빌드가 `built`인지 확인합니다.
10. 기존 `index.html`, `styles.css`, `app.js`의 인터페이스와 데이터 스키마 호환성을 보존합니다.

GitHub Pages는 `gh-pages` 브랜치 루트에서 배포됩니다. `main`만 갱신하면 공개 사이트에는 새 데이터가 나타나지 않으므로 정기 워크플로가 두 브랜치를 모두 갱신합니다.
