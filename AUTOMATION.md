# Dashboard automation instructions

정기 수집은 `.github/workflows/update-charts.yml`에서 매주 월요일 13:00 KST에 실행합니다.

## 공식 종합 앱 차트

1. Apple App Store 공식 Marketing Tools `apps/top-free/25` RSS와 Google Play 공식 `TOP_FREE + APPLICATION` 컬렉션에서 7개국 TOP 25를 수집합니다.
2. `data/YYYY-MM-DD.json` 및 `data/index.json`에 저장합니다.

## 공식 무료 게임 차트

3. Apple 공식 카테고리 필터 RSS `topfreeapplications/limit=25/genre=6014`와 Google Play 공식 `TOP_FREE + GAME` 컬렉션에서 같은 7개국 TOP 25를 수집합니다.
4. Apple 공식 App Store의 국가별 Games 차트 페이지와 동일하게 Games 장르 ID 6014를 사용합니다.
5. 게임 데이터는 기존 앱 데이터와 섞지 않고 `data/games/YYYY-MM-DD.json` 및 `data/games/index.json`에 저장합니다.
6. 게임 대시보드는 `games.html`과 `games.js`에서 국가별·주간·월간·장르·수집 상태를 제공합니다.

## 공통 검증 및 메타데이터 정책

7. 정확한 앱/게임-순위 매핑을 확인하지 못한 국가/스토어는 추정하지 않고 `unavailable`, 레코드 0개와 실패 사유로 기록합니다.
8. verified 차트는 정확히 25개, 순위 1~25, 중복 없는 안정적 스토어 ID를 요구합니다.
9. Apple 공식 iTunes Lookup과 Google Play 공식 상세 페이지에서 카테고리/장르·개발사·아이콘·실제 짧은 설명을 보강합니다.
10. 공식 설명은 생성형으로 재작성하지 않고 완결 문장 또는 원문 앞 180자만 발췌합니다.
11. 상세정보 확인 실패는 `공식 설명 미확인`, `descriptionStatus=unavailable`, 공식 상세 URL, 확인 시각과 실패 사유로 기록합니다.
12. 카테고리 확인 실패는 `미확인`과 명시적인 상태·출처·확인 시각·실패 사유로 기록하며 추정하지 않습니다.
13. 한국·미국 제목은 원문을 유지하고 일본·중국·프랑스·호주·독일은 `한글 번역(원어 제목)` 형식을 사용합니다. 번역 실패 원문 fallback은 성공 번역으로 캐시하지 않습니다.
14. Google 상세 조회는 낮은 동시 요청 수와 앱별 최대 3회 재시도를 사용합니다.
15. 앱 아이콘과 제목은 공식 Apple App Store 또는 Google Play 상세 페이지로 연결합니다.
16. 회귀 테스트와 앱·게임 스냅샷 검증을 모두 통과한 경우에만 `main`에 커밋합니다.
17. push 직전 최신 `origin/main`을 fetch/rebase하며 최대 3회 재시도합니다.
18. main 반영 성공 후에만 `index.html`, `games.html`, JavaScript/CSS, 문서와 `data` 전체를 `gh-pages`에 게시합니다.
19. GitHub Pages 빌드 상태를 확인하고 실패 시 원인을 보고합니다.
20. 모든 `YYYY-MM-DD` 기준일은 실행 시점의 `Asia/Seoul` 현지 날짜를 사용합니다.

GitHub Pages는 `gh-pages` 브랜치 루트에서 배포됩니다. 종합 앱 대시보드는 `/`, 무료 게임 대시보드는 `/games.html`입니다.

Last automation expansion: 2026-10-22 KST — added official country-level free game charts and Apple Games genre feed.
