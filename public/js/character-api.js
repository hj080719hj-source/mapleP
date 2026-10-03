const API_ROOT = 'https://open.api.nexon.com/maplestory/v1/';
const RETRY_LIMIT = 2;

function cancelled() {
  return new DOMException('캐릭터 조회를 취소했습니다.', 'AbortError');
}

function checkCancelled(signal) {
  if (signal?.aborted) throw cancelled();
}

function wait(ms, signal) {
  checkCancelled(signal);
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); cleanup(); reject(cancelled()); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function responseError(status) {
  let message = '넥슨 API 조회에 실패했습니다. 잠시 후 다시 조회해주세요.';
  if (status === 400) message = '조회 가능한 캐릭터인지 확인해주세요. 최근 접속하지 않은 캐릭터는 정보가 없을 수 있습니다.';
  if (status === 401 || status === 403) message = 'API 키가 올바른지, 메이플스토리 조회 권한이 있는지 확인해주세요.';
  if (status === 404) message = '캐릭터 정보를 찾지 못했습니다. 캐릭터 이름을 확인해주세요.';
  if (status === 429) message = '넥슨 API 조회 한도를 초과했습니다. 잠시 후 다시 조회해주세요.';
  if (status >= 500) message = '넥슨 API 서버가 응답하지 못했습니다. 잠시 후 다시 조회해주세요.';
  const error = new Error(message);
  error.status = status;
  return error;
}

function createRequest({ apiKey, signal, onProgress, fetchImpl, delayMs }) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) throw new Error('넥슨 API 키를 입력해주세요.');
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60000) throw new Error('조회 간격 설정이 올바르지 않습니다.');
  checkCancelled(signal);
  let requested = false;

  return async function request(path, params) {
    const url = new URL(path, API_ROOT);
    for (const [field, value] of Object.entries(params)) url.searchParams.set(field, value);
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
      if (requested) await wait(Math.min(delayMs * 2 ** Math.max(0, attempt - 1), 60000), signal);
      checkCancelled(signal);
      requested = true;
      const timeout = AbortSignal.timeout(20000);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { 'x-nxopen-api-key': key },
          signal: requestSignal,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
        });
      } catch {
        checkCancelled(signal);
        throw new Error(timeout.aborted
          ? '넥슨 API 응답 시간이 초과되었습니다. 다시 조회해주세요.'
          : '넥슨 API에 연결하지 못했습니다. 잠시 후 다시 조회해주세요.');
      }
      checkCancelled(signal);
      if (response.status === 429 && attempt < RETRY_LIMIT) {
        onProgress?.('조회 요청이 많아 잠시 기다린 뒤 다시 시도합니다.');
        continue;
      }
      if (!response.ok) throw responseError(response.status);
      try {
        const data = await response.json();
        checkCancelled(signal);
        return data;
      } catch {
        checkCancelled(signal);
        throw new Error(timeout.aborted
          ? '넥슨 API 응답 시간이 초과되었습니다. 다시 조회해주세요.'
          : '넥슨 API 응답 형식을 확인할 수 없습니다. 다시 조회해주세요.');
      }
    }
  };
}

/** API 키와 응답은 이 호출의 메모리에만 보관합니다. */
export async function loadCharacter({ name, apiKey, signal, onProgress, fetchImpl = fetch, delayMs = 550 }) {
  const characterName = typeof name === 'string' ? name.trim() : '';
  if (!characterName) throw new Error('캐릭터 이름을 입력해주세요.');
  const request = createRequest({ apiKey, signal, onProgress, fetchImpl, delayMs });
  onProgress?.('캐릭터를 찾고 있습니다.');
  const identity = await request('id', { character_name: characterName });
  if (typeof identity?.ocid !== 'string' || !identity.ocid.trim()) throw new Error('캐릭터 식별 정보를 찾지 못했습니다. 이름을 확인해주세요.');
  const params = { ocid: identity.ocid };

  onProgress?.('캐릭터 기본 정보를 불러오는 중입니다.');
  const basic = await request('character/basic', params);
  if (!basic?.character_name || !basic.character_class || !Number.isFinite(Number(basic.character_level)) || Number(basic.character_level) <= 0) {
    throw new Error('캐릭터 기본 정보가 없어 계산할 수 없습니다.');
  }
  onProgress?.('현재 캐릭터 능력치를 불러오는 중입니다.');
  const stats = await request('character/stat', params);
  if (!Array.isArray(stats?.final_stat) || !stats.final_stat.length || !stats.final_stat.some(stat => stat?.stat_name && stat.stat_value !== undefined && stat.stat_value !== null)) {
    throw new Error('현재 캐릭터 능력치가 없어 계산할 수 없습니다.');
  }

  const errors = [];
  async function optional(path, label, field, extraParams = {}) {
    onProgress?.(`${label} 정보를 불러오는 중입니다.`);
    try {
      const data = await request(path, { ...params, ...extraParams });
      if (!Array.isArray(data?.[field])) throw new Error(`${label} 정보가 제공되지 않았습니다.`);
      return data;
    } catch (error) {
      checkCancelled(signal);
      if (error.status === 401 || error.status === 403) throw error;
      errors.push(`${label}: ${error.message}`);
      return null;
    }
  }
  const equipment = await optional('character/item-equipment', '장비', 'item_equipment');
  const hexa = await optional('character/hexamatrix', 'HEXA 코어', 'character_hexa_core_equipment');
  const skills = await optional('character/skill', '6차 스킬', 'character_skill', { character_skill_grade: '6' });
  checkCancelled(signal);
  onProgress?.('캐릭터 조회를 완료했습니다.');
  return { ocid: identity.ocid, basic, stats, equipment, hexa, skills, errors, loadedAt: new Date().toISOString() };
}

/** 등록된 가장 최근 연무장 리플레이와 입장 당시 능력치를 함께 조회합니다. */
export async function loadPractice({ ocid, apiKey, signal, onProgress, fetchImpl = fetch, delayMs = 550 }) {
  const characterId = typeof ocid === 'string' ? ocid.trim() : '';
  if (!characterId) throw new Error('캐릭터를 먼저 조회해주세요.');
  const request = createRequest({ apiKey, signal, onProgress, fetchImpl, delayMs });
  onProgress?.('등록한 연무장 기록을 찾고 있습니다.');
  const records = await request('battle-practice/replay-id', { ocid: characterId });
  if (!Array.isArray(records?.replay_list)) throw new Error('연무장 기록 목록을 확인할 수 없습니다. 다시 조회해주세요.');
  if (!records.replay_list.length) return null;
  const replay = [...records.replay_list]
    .filter(record => typeof record?.replay_id === 'string' && record.replay_id.trim() && Number.isFinite(Date.parse(record.register_date)))
    .sort((a, b) => Date.parse(b.register_date) - Date.parse(a.register_date) || (Number(b.period_no) || 0) - (Number(a.period_no) || 0))[0];
  if (!replay) throw new Error('연무장 기록의 식별 정보나 등록 날짜가 없습니다.');

  const params = { replay_id: replay.replay_id };
  onProgress?.('가장 최근 연무장 측정 결과를 불러오는 중입니다.');
  const result = await request('battle-practice/result', params);
  const measured = value => (typeof value === 'number' || (typeof value === 'string' && value.trim())) && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (!measured(result?.total_play_time) || Number(result.total_play_time) <= 0 || !measured(result?.total_damage) || !measured(result?.total_dps)) {
    throw new Error('연무장 기록에 유효한 측정 시간이나 데미지가 없습니다.');
  }
  onProgress?.('연무장 입장 당시의 능력치를 불러오는 중입니다.');
  const characterInfo = await request('battle-practice/character-info', params);
  if (!characterInfo?.basic_object?.character_name || !Array.isArray(characterInfo?.stat_object?.basic_stat_object?.final_stat) || !characterInfo.stat_object.basic_stat_object.final_stat.length) {
    throw new Error('연무장 입장 당시의 캐릭터 능력치가 없어 비교할 수 없습니다.');
  }
  checkCancelled(signal);
  onProgress?.('연무장 기록 조회를 완료했습니다.');
  return { replay, result, characterInfo, loadedAt: new Date().toISOString() };
}
