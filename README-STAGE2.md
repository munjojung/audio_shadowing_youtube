# R2 다중 콘텐츠 등록 V2

기존 UI 변경 없이 `/api/contents` 공개 목록 API 및 `/api/content-url?id=...&type=audio|ko|en` 임시 URL API를 사용합니다. 등록 목록은 `data/content-catalog.json`으로 관리되며 승인된 콘텐츠만 서명됩니다.

## 등록

관리자 PC에서 **읽기 전용 재생 토큰과 별개인 쓰기 권한 토큰**을 준비하세요. PowerShell 세션에 `R2_ACCOUNT_ID`, `R2_UPLOAD_ACCESS_KEY_ID`, `R2_UPLOAD_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`을 환경변수로 설정합니다. 비밀값을 Git에 커밋하거나 채팅에 붙여넣지 마세요.

```powershell
npm.cmd install
node scripts/register-content.js NEWVIDEO123 "C:\media\topic_NEWVIDEO123.mp3" "C:\media\topic_NEWVIDEO123_ko.vtt" "C:\media\topic_NEWVIDEO123_en.vtt" "New lesson title"
```

위 예시는 형식 안내입니다. 실제 11자리 콘텐츠 ID와 일치하는 파일명으로 교체하세요. 등록 스크립트는 3개 파일을 R2에 업로드한 뒤 로컬 카탈로그를 갱신합니다. 업로드 도중 실패한 경우 수동 점검 후 재시도해야 하며 자동 롤백은 제공하지 않습니다. 배포하려면 갱신된 카탈로그와 코드 변경을 Git에 커밋/푸시하세요.

## 확인

- `/api/contents` → 승인된 콘텐츠의 id/title 목록
- `/api/content-url?id=TSIgstxOCwY&type=audio` → 15분 임시 URL
- `/?content=TSIgstxOCwY` → 지정 콘텐츠
- `/` → 한국 날짜에 따른 일일 추천

## 주의

- 회원 인증 및 접근 제한은 미구현. 승인된 모든 콘텐츠는 누구나 열람 가능합니다.
- R2 직접 목록 조회가 아니라 관리자 업로드 후 카탈로그 갱신 방식입니다.
- 15분 URL 만료 시 재생/탐색 문제가 생길 수 있어 별도 갱신 개선이 필요합니다.
- R2 CORS 및 모바일 브라우저 테스트 필요.
- `index.html`은 이전 대화에서 제공된 R2 V1 파일을 기반으로 하므로 현재 GitHub main과 diff 검토가 필요합니다.
