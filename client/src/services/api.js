/**
 * API 서비스 레이어
 * 향후 실제 서버 API 연결 시 이 파일만 수정하면 됩니다.
 *
 * 현재는 Mock 응답을 반환하며, 스트리밍과 이미지 생성을 시뮬레이션합니다.
 */

const API_BASE_URL = '/api';

// ─── Mock 텍스트 응답들 ───
const MOCK_RESPONSES = [
  `안녕하세요! 저는 Gemini 3.1 Pro입니다. 프롬프트 대회에 오신 것을 환영합니다! 🎉\n\n이 대회에서는 여러분의 창의적인 프롬프트 작성 능력을 평가합니다. 좋은 프롬프트는 명확하고, 구체적이며, 맥락을 잘 포함해야 합니다.\n\n무엇이든 물어보세요!`,
  `좋은 질문이네요! 프롬프트 엔지니어링에서 가장 중요한 것은 다음과 같습니다:\n\n1. **명확한 지시**: 원하는 결과를 구체적으로 설명\n2. **맥락 제공**: 충분한 배경 정보 포함\n3. **형식 지정**: 원하는 출력 형식을 명시\n4. **예시 활용**: Few-shot 프롬프팅으로 품질 향상\n\n이 원칙들을 잘 활용하면 AI의 응답 품질이 크게 향상됩니다.`,
  `프롬프트를 분석해보겠습니다.\n\n## 강점\n- 목표가 잘 정의되어 있습니다\n- 제약 조건이 명확합니다\n\n## 개선 포인트\n- 출력 형식을 더 구체적으로 지정해보세요\n- 톤과 스타일도 추가하면 좋겠습니다\n\n전체적으로 **B+** 등급입니다. 조금만 다듬으면 A+도 가능합니다!`,
  `흥미로운 접근이네요! AI 모델의 응답은 프롬프트의 구조에 크게 의존합니다.\n\n> "좋은 프롬프트는 좋은 질문과 같다. 답을 형성하는 것은 질문의 질이다."\n\n제가 추천하는 프롬프트 패턴:\n\n\`\`\`\n역할: [원하는 AI 역할]\n맥락: [상황 설명]\n작업: [구체적 요청]\n형식: [출력 형식]\n제약: [제한 사항]\n\`\`\`\n\n이 템플릿으로 시작해보세요!`,
  `네, 그 부분에 대해 자세히 설명해드리겠습니다.\n\n프롬프트 최적화는 반복적인 과정입니다. 처음부터 완벽한 프롬프트를 작성하기는 어렵지만, 다음 단계를 따르면 점진적으로 개선할 수 있습니다:\n\n**Step 1**: 기본 프롬프트 작성\n**Step 2**: 결과 평가\n**Step 3**: 약점 파악\n**Step 4**: 프롬프트 수정\n**Step 5**: 반복\n\n이 사이클을 3-4번 반복하면 대부분 만족스러운 결과를 얻을 수 있습니다. 💡`
];

/**
 * 텍스트 스트리밍을 시뮬레이션합니다.
 * 실제 API에서는 서버에서 SSE/WebSocket으로 청크를 받습니다.
 *
 * @param {string} prompt - 사용자 입력
 * @param {function} onChunk - 각 텍스트 청크가 도착할 때 호출되는 콜백
 * @param {AbortSignal} signal - 취소 시그널
 * @returns {Promise<string>} 전체 응답 텍스트
 */
export async function streamTextChat(prompt, onChunk, signal) {
  // ── 향후 실제 API 연결 시 아래 코드로 교체 ──
  // const response = await fetch(`${API_BASE_URL}/chat/stream`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ prompt, model: 'gemini-3.1-pro' }),
  //   signal,
  // });
  // const reader = response.body.getReader();
  // const decoder = new TextDecoder();
  // let fullText = '';
  // while (true) {
  //   const { done, value } = await reader.read();
  //   if (done) break;
  //   const chunk = decoder.decode(value, { stream: true });
  //   fullText += chunk;
  //   onChunk(chunk);
  // }
  // return fullText;

  // ── Mock 스트리밍 구현 ──
  const responseText = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)];
  const words = responseText.split('');
  let fullText = '';

  // 시작 전 약간의 딜레이 (모델 처리 시뮬레이션)
  await new Promise((resolve) => setTimeout(resolve, 800));

  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const char = words[i];
    fullText += char;
    onChunk(char);

    // 랜덤 타이핑 속도 (자연스러운 스트리밍 효과)
    const delay = char === '\n' ? 60 : char === ' ' ? 25 : 15 + Math.random() * 20;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return fullText;
}

/**
 * 이미지 생성을 시뮬레이션합니다.
 * 실제 API에서는 서버에서 이미지 URL을 반환합니다.
 *
 * @param {string} prompt - 이미지 생성 프롬프트
 * @param {AbortSignal} signal - 취소 시그널
 * @returns {Promise<{ imageUrl: string, description: string }>}
 */
export async function generateImage(prompt, signal) {
  // ── 향후 실제 API 연결 시 아래 코드로 교체 ──
  // const response = await fetch(`${API_BASE_URL}/image/generate`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ prompt, model: 'gemini-3.1-flash-image-preview' }),
  //   signal,
  // });
  // const data = await response.json();
  // return { imageUrl: data.imageUrl, description: data.description };

  // ── Mock 이미지 생성 구현 ──
  // 로딩 시뮬레이션 (2~4초)
  const loadTime = 2000 + Math.random() * 2000;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, loadTime);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Picsum에서 랜덤 이미지 사용 (실제로는 Gemini가 생성)
  const imageId = Math.floor(Math.random() * 200) + 100;
  const imageUrl = `https://picsum.photos/id/${imageId}/512/512`;

  return {
    imageUrl,
    description: `🎨 나노바나나가 "${prompt}" 를 기반으로 이미지를 생성했습니다.`,
  };
}
