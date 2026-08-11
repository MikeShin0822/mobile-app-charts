# Dashboard automation instructions

매주 차트 수집 작업은 다음 순서를 지킵니다.

1. Apple App Store와 Google Play의 공식 공개 페이지만 사용해 7개국 무료 앱 TOP 25를 수집합니다.
2. 정확한 앱-순위 매핑을 확인하지 못한 스토어/국가는 추정하지 않고 `unavailable`로 기록합니다.
3. `data/YYYY-MM-DD.json` 스냅샷을 추가하고 `data/index.json`에 날짜를 등록합니다.
4. 앱 제목 표기를 이전 스냅샷과 최대한 일관되게 유지합니다.
5. 데이터 및 대시보드 변경을 `main`에 커밋합니다.
6. 같은 최종 커밋 또는 동일한 파일 변경을 Pages 게시 브랜치인 `gh-pages`에도 반영합니다.
7. `https://mikeshin0822.github.io/mobile-app-charts/`의 Pages 빌드가 `built`인지 확인합니다.
8. 기존 `index.html`, `styles.css`, `app.js`의 인터페이스와 데이터 스키마 호환성을 보존합니다.

GitHub Pages는 `gh-pages` 브랜치 루트에서 배포됩니다. `main`만 갱신하면 공개 사이트에는 새 데이터가 나타나지 않으므로 반드시 `gh-pages`도 갱신해야 합니다.
