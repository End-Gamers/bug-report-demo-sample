# Jennifer APM 버그 리포트 생성기

Jennifer APM 로그를 붙여넣으면 Groq AI(Llama 3.3 70B)가 심각도·근본원인·해결책을 분석해 경영진용 에러 분석 리포트를 자동 생성합니다.

## 개발자 튜토리얼

이 앱을 Claude Code로 직접 만들어보는 단계별 가이드입니다.

👉 **[튜토리얼 보기](https://End-Gamers.github.io/bug-report-demo-sample/)**

## 시작하기

1. [Groq Console](https://console.groq.com/)에서 무료 API 키 발급 (`gsk_...`)
2. `index.html`을 브라우저에서 열거나 로컬 서버 실행
3. API 키 입력 후 Jennifer APM 로그 붙여넣기 → 분석 시작

<img width="1848" height="2960" alt="Screenshot_20260424_092240_Chrome" src="https://github.com/user-attachments/assets/ace96203-a188-4894-aaa2-d56dec23f46e" />

## 기술 스택

- Vanilla JS (ES Modules)
- Groq API — `llama-3.3-70b-versatile`
- Jennifer APM 로그 파서 (`lib/parser.js`)
